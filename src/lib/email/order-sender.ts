import 'server-only'
import { and, asc, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { orders, orderEvents, orderLines, shipments } from '@/lib/db/schema-orders'
import { orderEdits } from '@/lib/db/schema-edits'
import { emailMessages, emailShops, emailSuppressions, shopEmails } from '@/lib/db/schema-email'
import { enqueue, GiveUp, Later, type OutboxRow } from '@/lib/outbox'
import { shopLook, shopSettingsFor } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import { manifestsFor } from '@/lib/themes/manifests'
import { EMAIL_SHOP_DOMAIN, SES_CONFIG_SHOPS } from '@/lib/env'
import { paperAccent } from '@/domains/documents/paper'
import { ORDER_MESSAGES, type OrderMessage } from '@/domains/messaging/events'
import { stillTrue } from '@/domains/messaging/still'
import { cleanEmail } from '@/domains/email/shape'
import { fromHeader } from '@/domains/email/headers'
import { composeOrderEmail } from './compose'
import { KEEP_ASKING_MS, settleWithRazorpay } from '@/lib/orders/payment-check'
import type { SkipCode } from '@/domains/email/state'
import { suppressionHashes } from './hash'
import { sendEmail, setUpTenant, tenantName } from './ses'

// =============================================================================
// FILE: src/lib/email/order-sender.ts — THE `email.order` SENDER (email plan E·2, task 12). One outbox row = one email;
// its id is the message id (tag m). Two transactions around the SES call: (re-read the order and say whether this
// email is still true, suppressed, switched off, capped; write the attempt row) → SES → (mark it). A reason not to send
// is a skip with its code on the message row (the Emails card says why), never a retry. Shop facts are read outside the
// transaction (speed review P9); the logo goes by URL. The address is read from the order, never stored on the row.
// =============================================================================

type Payload = { orderId?: unknown; eventId?: unknown; kind?: unknown }
const UUID = /^[0-9a-f-]{36}$/

/** The shop's SES tenant (`t-<tenant id>`, with the shops' identity and configuration set), created once and marked
 *  ready in email_shops. Idempotent: an existing tenant or association counts as done. Every send under a shop's tenant
 *  needs it first (a missing tenant is SES's NotFoundException). */
export async function ensureShopTenant(tenantId: string): Promise<{ ok: true } | { ok: false; retry: boolean; code: string }> {
  const [es] = await withTenant(tenantId, (tx) => tx.select({ ready: emailShops.sesReadyAt }).from(emailShops).where(eq(emailShops.tenantId, tenantId)).limit(1))
  if (es?.ready) return { ok: true }
  const r = await setUpTenant(tenantName(tenantId), EMAIL_SHOP_DOMAIN, SES_CONFIG_SHOPS, new Date())
  if (!r.ok) return r
  await withTenant(tenantId, (tx) => tx.insert(emailShops).values({ tenantId, sesReadyAt: new Date() })
    .onConflictDoUpdate({ target: emailShops.tenantId, set: { sesReadyAt: new Date() } }))
  return { ok: true }
}

/** The shop's SES tenant, set up ahead (paced: SES's control calls are 1 a second). */
export async function sendTenantSetup(row: OutboxRow): Promise<void> {
  const r = await ensureShopTenant(row.tenantId)
  if (!r.ok) { if (r.retry) throw new Later(r.code, 2); throw new Error(r.code) }
}

export async function sendOrderEmail(row: OutboxRow): Promise<void> {
  const p = row.payload as Payload
  if (typeof p?.orderId !== 'string' || !UUID.test(p.orderId) || !(ORDER_MESSAGES as readonly string[]).includes(String(p.kind))
    || (p.eventId !== null && p.eventId !== undefined && (typeof p.eventId !== 'string' || !UUID.test(p.eventId)))) throw new GiveUp('bad payload')
  const kind = p.kind as OrderMessage, orderId = p.orderId, eventId = (p.eventId as string | null) ?? null
  const tenantId = row.tenantId, messageId = row.id, now = new Date()
  // "Finish paying… nothing was charged" only once Razorpay says so: a webhook lost or late meant a shopper who had paid
  // was told they hadn't (shop stress test 2026-11-11). A capture is recorded here (then stillTrue skips the email);
  // a payment in flight or Razorpay not answering waits.
  // Asked for up to 72 hours like the payment check; after that the email decides on what is stored.
  if (kind === 'finish_paying' && Date.now() - new Date(row.createdAt).getTime() < KEEP_ASKING_MS) {
    const settled = await settleWithRazorpay(tenantId, orderId)
    if (settled === 'pending') throw new Later('payment in flight', 10)
    if (settled === 'unknown') throw new Later('razorpay unreachable', 5)
  }
  const shop = await shopSettingsFor(tenantId)
  if (!shop) throw new GiveUp('no shop')
  const [look, src] = await Promise.all([shopLook(tenantId).catch(() => null), manifestsFor(tenantId)])
  const accent = paperAccent(themeOf(shop, look, src).schemes.paper.accent)

  const job = await withTenant(tenantId, async (tx) => {
    const [prior] = await tx.select().from(emailMessages).where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.id, messageId))).limit(1)
    if (prior?.sentAt || prior?.skippedAt || prior?.failedAt) return { done: true as const }
    // SES has no idempotency key: an attempt with no answer waits 15 minutes for an event carrying our id (plan decision 9).
    if (prior?.attemptedAt && now.getTime() - prior.attemptedAt.getTime() < 15 * 60_000) return { wait: 'attempted' as const }
    const [o] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).limit(1)
    if (!o) return { done: true as const }
    const skip = async (code: SkipCode) => {
      const set = { skippedAt: now, skipCode: code }
      if (prior) await tx.update(emailMessages).set(set).where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.id, messageId)))
      else await tx.insert(emailMessages).values({ id: messageId, tenantId, kind, orderId, eventId, ...set })
      return { done: true as const }
    }
    const to = cleanEmail(o.email)
    if (!to) return skip('no_email')
    if (!EMAIL_SHOP_DOMAIN) return skip('not_set_up') // a reason on the card, never a silent drop
    const [undone] = eventId ? await tx.select({ id: orderEvents.id }).from(orderEvents).where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.undoes, eventId))).limit(1) : []
    const still = stillTrue(kind, { ...o, stockShort: false }, now, !!undone)
    if (still !== 'ok') return skip(still)
    // Items changed again since, that change emailing too (and not undone): its email says where the order stands. A
    // later change saved without the email leaves this one to say it.
    const [later] = kind === 'edited' && eventId ? await tx.execute(sql`select 1 from ${orderEvents} l join ${orderEdits} x on x.tenant_id = l.tenant_id and x.event_id = l.id and x.notify
      where l.tenant_id = ${tenantId} and l.order_id = ${o.id} and l.kind = 'items_edited'
      and l.at > (select e.at from ${orderEvents} e where e.tenant_id = ${tenantId} and e.id = ${eventId}) and not exists (select 1 from ${orderEvents} u where u.tenant_id = l.tenant_id and u.undoes = l.id) limit 1`) : []
    if (later) return skip('superseded')
    if (!shop.publishedAt) return skip('shop_closed')
    const replyTo = cleanEmail(shop.supportEmail)
    if (!replyTo) return skip('no_support_email')
    const [own] = await tx.select().from(shopEmails).where(and(eq(shopEmails.tenantId, tenantId), eq(shopEmails.kind, kind))).limit(1)
    if (own?.offAt) return skip('off')
    const hashes = suppressionHashes(tenantId, to)
    if (hashes) {
      const [sup] = await tx.select({ id: emailSuppressions.id }).from(emailSuppressions)
        .where(and(eq(emailSuppressions.tenantId, tenantId), inArray(emailSuppressions.addressHash, hashes.lookup), isNull(emailSuppressions.liftedAt))).limit(1)
      if (sup) return skip('suppressed')
    }
    const [es] = await tx.select().from(emailShops).where(eq(emailShops.tenantId, tenantId)).limit(1)
    if (!es?.sesReadyAt) {
      // Set the shop's SES tenant up first (its own paced row); this email waits for it.
      await enqueue(tx, { tenantId, kind: 'email.tenant', dedupeKey: 'email-tenant', payload: {} })
      return { wait: 'tenant' as const }
    }
    const since = new Date(now.getTime() - 86_400_000)
    // The cap counts emails to shoppers only: staff notices and tests never use it up.
    const [cnt] = await tx.select({ n: count() }).from(emailMessages).where(and(eq(emailMessages.tenantId, tenantId), gte(emailMessages.createdAt, since), inArray(emailMessages.kind, [...ORDER_MESSAGES]), sql`${emailMessages.sentAt} is not null`))
    if ((cnt?.n ?? 0) >= es.dailyCap) return skip('capped')
    const [lines, [ship]] = await Promise.all([
      tx.select({ title: orderLines.title, values: orderLines.optionValues, qty: orderLines.qty }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id), isNull(orderLines.removedAt))).orderBy(asc(orderLines.position)),
      tx.select({ courier: shipments.courierName, tracking: shipments.trackingNumber }).from(shipments).where(and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, o.id), isNull(shipments.endedAt))).limit(1),
    ])
    if (prior) await tx.update(emailMessages).set({ attemptedAt: now }).where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.id, messageId)))
    else await tx.insert(emailMessages).values({ id: messageId, tenantId, kind, orderId, eventId, attemptedAt: now })
    return { send: { o, to, replyTo, own, lines, ship } }
  })
  if ('done' in job) return
  if ('wait' in job) throw new Later(job.wait === 'tenant' ? 'ses_tenant_not_ready' : 'awaiting_ses_event', job.wait === 'tenant' ? 1 : 15)

  const { o, to, replyTo, own, lines, ship } = job.send
  const { mail, subject } = composeOrderEmail({ kind, shop, accent, order: { ...o, stockShort: false }, lines, ship, own, to, replyTo })
  const sent = await sendEmail({
    from: fromHeader(shop.shopName, `${shop.slug}@${EMAIL_SHOP_DOMAIN}`), to, replyTo, subject, html: mail.html, text: mail.text,
    configurationSet: SES_CONFIG_SHOPS, tenant: tenantName(tenantId), messageId, tenantTag: tenantId,
  }, now)
  await withTenant(tenantId, (tx) => tx.update(emailMessages).set(sent.ok ? { sentAt: new Date(), providerId: sent.providerId }
    : sent.retry ? { attemptedAt: null } : { failedAt: new Date(), failedCode: sent.code.replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 48) })
    .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.id, messageId))))
  if (!sent.ok && sent.retry) throw new Later(sent.code, 5)
}
