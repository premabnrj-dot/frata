import 'server-only'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { askable } from '@/domains/reviews/schedule'
import { askComponents, firstNameOf, REVIEW_TEMPLATE, REVIEW_TEMPLATE_LANG } from '@/domains/reviews/template'
import { phoneHmac, reviewToken } from '@/lib/crypto/secret-box'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { tokenFor } from '@/lib/modules/communication/connection'
import { sendTemplate, templateState } from '@/lib/modules/communication/graph'
import { shopSettingsFor } from '@/lib/queries/storefront'
import { GiveUp, type OutboxRow } from '@/lib/outbox'
import { reviewRequests, reviews, reviewSettings, waOptOuts } from './schema'

// =============================================================================
// FILE: src/lib/modules/reviews/sender.ts — the outbox sender for `review:ask` (Reviews R1 task 6b).
//
// The payload is ids only ({ requestId, reminder? }): no phone, name, link or token ever sits in an outbox row
// (tenancy audit; the claim runs through a definer across shops, drizzle/0096). Everything is read again here, inside the shop's own
// transaction, and checked again at the moment of sending: still delivered, still opted in, not stopped, not
// reviewed yet, the template approved and still UTILITY. A reason not to send is not an error — the row is done and
// the request says why (fail_code: a code, never a phone or Meta's body). Meta's own refusals are errors (retried).
// =============================================================================

export type AskPayload = { requestId: string; reminder?: boolean }

export async function sendReviewAsk(row: OutboxRow): Promise<void> {
  const p = row.payload as AskPayload
  if (typeof p?.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(p.requestId)) throw new Error('review ask: bad payload')
  const now = new Date()
  const tenantId = row.tenantId
  const shop = await shopSettingsFor(tenantId)
  if (!shop) throw new Error('review ask: no shop')
  const job = await withTenant(tenantId, async (tx) => {
    const [r] = await tx.select().from(reviewRequests).where(and(eq(reviewRequests.tenantId, tenantId), eq(reviewRequests.id, p.requestId)))
    if (!r) return { skip: 'no_request' as const }
    const [o] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, r.orderId)))
    if (!o) return { skip: 'no_order' as const }
    const stop = (code: string) => tx.update(reviewRequests).set({ failCode: code }).where(and(eq(reviewRequests.tenantId, tenantId), eq(reviewRequests.id, r.id))).then(() => ({ skip: code }))
    if (p.reminder ? r.remindedAt : r.sentAt) return { skip: 'already_sent' as const }
    const [done] = await tx.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.tenantId, tenantId), eq(reviews.requestId, r.id))).limit(1)
    if (done) return stop('reviewed')
    const [out] = await tx.select({ at: waOptOuts.at }).from(waOptOuts).where(and(eq(waOptOuts.tenantId, tenantId), eq(waOptOuts.phoneHmac, phoneHmac(tenantId, o.phone)))).limit(1)
    if (!askable({ ...o, stockShort: false, optedOut: !!out }, now)) return stop(out ? 'opted_out' : 'not_askable')
    const [s] = await tx.select().from(reviewSettings).where(eq(reviewSettings.tenantId, tenantId))
    if (s?.templateStatus !== 'APPROVED' || s.templateCategory !== 'UTILITY') return { wait: 'template' as const }
    const wa = await tokenFor(tx, tenantId)
    if (!wa) return { wait: 'connection' as const }
    const [line] = await tx.select({ title: orderLines.title }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, o.id), isNull(orderLines.removedAt))).orderBy(asc(orderLines.id)).limit(1)
    return { send: { request: r, phone: o.phone, name: o.customerName, product: line?.title ?? 'order', token: wa.token, phoneNumberId: wa.row.phoneNumberId, wabaId: wa.row.wabaId } }
  })
  if ('skip' in job) return
  // Waiting on the shop (template not approved yet, WhatsApp not connected): a retry later, with our own words.
  if ('wait' in job) throw new Error(job.wait === 'template' ? 'the review template is not approved yet' : 'WhatsApp is not connected')
  const { request, phone, name, product, token, phoneNumberId, wabaId } = job.send
  const link = reviewToken(tenantId, request.orderId, request.tokenNonce)
  const sent = await sendTemplate(token, phoneNumberId, phone, REVIEW_TEMPLATE, REVIEW_TEMPLATE_LANG, askComponents({ firstName: firstNameOf(name), product, shop: shop.shopName, token: link }))
  const mark = (set: Partial<typeof reviewRequests.$inferInsert>) => withTenant(tenantId, (tx) => tx.update(reviewRequests).set(set).where(and(eq(reviewRequests.tenantId, tenantId), eq(reviewRequests.id, request.id))))
  if (!sent.ok) {
    // Error codes: frata-integrations § Send errors (checked 2026-11-09).
    // The shopper cannot get it (not on WhatsApp, ToS not accepted): done, with the reason.
    if (sent.code === 131026) { await mark({ failedAt: now, failCode: 'meta_131026' }); return }
    // Our request is malformed (unsupported type, wrong parameter count or format): retrying never helps.
    if (sent.code === 131051 || sent.code === 132000 || sent.code === 132012) throw new GiveUp(`the review message is malformed (${sent.code})`)
    // The template is not usable now (not approved, paused, disabled for good): read its state back, so every
    // later send waits on the template gate instead of failing one by one.
    if (sent.code === 132001 || sent.code === 132015 || sent.code === 132016) {
      const st = await templateState(token, wabaId, REVIEW_TEMPLATE)
      if (st && st !== 'rejected') await withTenant(tenantId, (tx) => tx.update(reviewSettings).set({ templateId: st.id, templateStatus: sent.code === 132016 ? 'DISABLED' : st.status, templateCategory: st.category, templateAt: now }).where(eq(reviewSettings.tenantId, tenantId)))
      throw new Error('the review template is not approved yet')
    }
    if (sent.code === 131042) throw new Error('WhatsApp needs a payment method (WhatsApp Manager)')
    throw new Error(sent.rejected ? 'WhatsApp needs reconnecting' : `WhatsApp refused the send (${sent.code ?? sent.status})`)
  }
  await mark(p.reminder ? { remindedAt: now, reminderWamid: sent.wamid } : { sentAt: now, wamid: sent.wamid, failCode: null })
}
