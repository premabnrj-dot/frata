import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { storeWhatsAppEvent } from '@/lib/db/platform'
import { webhookEvents } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'
import { HEALTH_FIELDS, KEEP_FIELDS, splitWebhook } from '@/domains/communication/webhook'
import { closeConnection, refreshHealth, SYSTEM_ACTOR } from './connection'

// =============================================================================
// FILE: src/lib/modules/communication/webhook.ts — Meta's webhook for Messages (ADR-0006, inbound).
// Verified on the RAW body (X-Hub-Signature-256: "sha256=<hex>", HMAC with Frrata's app secret), split into
// items, each routed to a shop by its own id through a definer, stored under OUR key, answered at once.
// An item for no open connection is not stored. Processing in C1: a health change re-reads the number's health.
// Messages, echoes and the Business app's history are kept whole and unprocessed for the inbox (C3): Meta sends
// them once. They are readable only inside their shop (webhook_events policies, drizzle/0030).
// =============================================================================

/** Stores each item for its shop. Returns the shops that got at least one new row (to process now). */
export async function storeWebhook(body: unknown): Promise<string[]> {
  const shops = new Set<string>()
  for (const item of splitWebhook(body)) {
    // An item with no id of its own (an account or quality update, a history page) is keyed by a digest of its
    // value and the entry's time: Meta's retry collapses; the same event sent again later is a new row.
    const tail = item.key ?? `${item.route.id}:${item.field}:${createHash('sha256').update(JSON.stringify([item.at, item.value])).digest('hex').slice(0, 32)}`
    const t = await storeWhatsAppEvent(item.route.by, item.route.id, tail, { field: item.field, value: item.value, about: item.route.id })
    if (t) shops.add(t)
  }
  return [...shops]
}

/** One shop's unprocessed WhatsApp items that C1 acts on: health changes re-read health (once); PARTNER_REMOVED
 *  closes that account's connection. Messages, echoes and history are left unprocessed and whole for the inbox
 *  (KEEP_FIELDS): Meta sends them once (impact review of C1). */
export async function processWhatsApp(tenantId: string, now: Date): Promise<number> {
  const { n, health } = await withTenant(tenantId, async (tx) => {
    const rows = await tx.select({ id: webhookEvents.id, payload: webhookEvents.payload }).from(webhookEvents)
      .where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.provider, 'whatsapp'), isNull(webhookEvents.processedAt)))
      .orderBy(webhookEvents.receivedAt).limit(200).for('update', { skipLocked: true })
    let health = false, n = 0
    for (const r of rows) {
      const pl = r.payload as { field?: unknown; value?: { event?: unknown }; about?: unknown }
      const field = String(pl.field ?? '')
      if (KEEP_FIELDS.has(field)) continue
      if (HEALTH_FIELDS.has(field)) health = true
      // The merchant disconnected Frrata in the Business app or Meta's tools: close THAT account's row, delete the token.
      if (field === 'account_update' && pl.value?.event === 'PARTNER_REMOVED' && typeof pl.about === 'string') {
        if (await closeConnection(tx, tenantId, SYSTEM_ACTOR, now, pl.about)) health = false
      }
      await tx.update(webhookEvents).set({ processedAt: sql`now()`, payload: { field } })
        .where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.id, r.id)))
      n++
    }
    return { n, health }
  })
  if (health) await refreshHealth(tenantId, now)
  return n
}
