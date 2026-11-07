import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { storeWebhookEvent, tenantForWhatsApp } from '@/lib/db/platform'
import { webhookEvents } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'
import { HEALTH_FIELDS, splitWebhook } from '@/domains/communication/webhook'
import { closeConnection, refreshHealth, SYSTEM_ACTOR } from './connection'

// =============================================================================
// FILE: src/lib/modules/communication/webhook.ts — Meta's webhook for Messages (ADR-0006, inbound).
// Verified on the RAW body (X-Hub-Signature-256: "sha256=<hex>", HMAC with Frrata's app secret), split into
// items, each routed to a shop by its own id through a definer, stored under OUR key, answered at once.
// An item for no open connection is not stored. Processing in C1: a health change re-reads the number's health.
// Message, status and echo items have no handler until C2/C3: they are marked processed with their payload
// emptied, so no shopper data is kept unused (retention, architecture review).
// =============================================================================

export function verifyMetaSignature(raw: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith('sha256=')) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'utf8')
  const got = Buffer.from(header.slice(7), 'utf8')
  return expected.length === got.length && timingSafeEqual(expected, got)
}

/** Stores each item for its shop. Returns the shops that got at least one new row (to process now). */
export async function storeWebhook(body: unknown): Promise<string[]> {
  const items = splitWebhook(body)
  const routes = new Map<string, string | null>()
  const shops = new Set<string>()
  for (const item of items) {
    const rk = `${item.route.by}:${item.route.id}`
    if (!routes.has(rk)) routes.set(rk, await tenantForWhatsApp(item.route.by, item.route.id))
    const tenantId = routes.get(rk)
    if (!tenantId) continue
    const tail = item.key ?? `${item.route.id}:${item.field}:${createHash('sha256').update(JSON.stringify(item.value)).digest('hex').slice(0, 32)}`
    if (await storeWebhookEvent('whatsapp', `whatsapp:${tenantId}:${tail}`, tenantId, { field: item.field, value: item.value })) shops.add(tenantId)
  }
  return [...shops]
}

/** One shop's unprocessed WhatsApp items. Health changes: read health again (once). Shopper data: emptied. */
export async function processWhatsApp(tenantId: string, now: Date): Promise<number> {
  const { n, health } = await withTenant(tenantId, async (tx) => {
    const rows = await tx.select({ id: webhookEvents.id, payload: webhookEvents.payload }).from(webhookEvents)
      .where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.provider, 'whatsapp'), isNull(webhookEvents.processedAt)))
      .orderBy(webhookEvents.receivedAt).limit(200).for('update', { skipLocked: true })
    let health = false
    for (const r of rows) {
      const field = String((r.payload as { field?: unknown }).field ?? '')
      if (HEALTH_FIELDS.has(field)) health = true
      // The merchant disconnected Frrata in the Business app or Meta's tools: close the row, delete the token.
      if (field === 'account_update' && (r.payload as { value?: { event?: unknown } }).value?.event === 'PARTNER_REMOVED') {
        await closeConnection(tx, tenantId, SYSTEM_ACTOR, now); health = false
      }
      await tx.update(webhookEvents).set({ processedAt: sql`now()`, payload: { field }, lastError: HEALTH_FIELDS.has(field) ? null : 'no handler before C2' })
        .where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.id, r.id)))
    }
    return { n: rows.length, health }
  })
  if (health) await refreshHealth(tenantId, now)
  return n
}
