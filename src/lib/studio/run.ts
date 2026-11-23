import 'server-only'
import { randomUUID } from 'node:crypto'
import { CARD_NOTICE_LEAD_MS, renewalPlan, renewalStep, RETRY_DAYS, LAPSE_DAYS, type Seat } from '@/domains/studio/credits'
import { NOTICE_LEAD_MS } from '@/domains/billing/collect'
import { quote, SEAT_PLANS } from '@/domains/studio/prices'
import { creditMail, type MailFacts } from '@/domains/email/partner-credits'
import { frrataEmail } from '@/domains/email/layouts'
import { paise } from '@/domains/money/paise'
import { billingGatewayIsTest, cancelToken, chargeRecurring, createRenewalOrder, fetchPayment, isBillingGatewayConfigured, orderByReceipt, orderPayments, paymentRefunds, refundPayment } from '@/lib/billing/gateway'
import { frrataSeller } from '@/lib/billing/seller'
import { system, type NoticeRow, type RenewalRow } from '@/lib/db/partner-credits'
import { applyBillingEvent, billingUnapplied } from '@/lib/db/platform'
import { sendEmail } from '@/lib/email/ses'
import { EMAIL_NOTICES_FROM, SES_CONFIG_NOTICES, isEmailConfigured } from '@/lib/env'
import { CONSOLE_HOST } from '@/lib/public-env'
import { formatInr } from '@/lib/format'
import { dayMonthIN, monthLongIN, timeIN } from '@/lib/format-date'
import { errName } from '@/lib/log'
import { realMoney } from './purchase'

// =============================================================================
// FILE: src/lib/studio/run.ts — STUDIO CREDITS' HOURLY RUN (/api/cron/credits; C1·3, C1·6; speed H3: its own route, not
// the daily outbox). In order, each under the run's deadline:
//   0. webhook events stored but not yet applied (drizzle/0165 routes a partner's to the ledger);
//   1. attempts that never came back: ask the gateway about OUR order; apply, or close when nothing was taken;
//   2. renewals: renewalStep decides — a notice (the attempt row and its email, amount frozen), a debit (claimed once,
//      never resent), the seat's end, or its lapse to Partner on day 7;
//   3. renewal orders: once our email went, the order carrying Razorpay's own notice; the notice clock starts then;
//   4. refunds of money that bought nothing; 5. mandates no longer used; 6. the emails.
// At 1,000 partners about 33 renewals fall on a day (each partner's own day): well inside one hourly run.
// =============================================================================

const DAY = 86_400_000
export type RunResult = { settled: number; notices: number; debits: number; ended: number; orders: number; refunds: number; cancels: number; emails: number; stale: number }
/** An open use older than this is returned whole as a timeout (a crashed turn; a turn runs minutes, not hours). */
const STALE_USE_MINUTES = 120
/** The renewal's order is made on the run after its email, so the notice's debit time allows one more pass. */
const ORDER_PASS_MS = 60 * 60_000

export async function runCredits(now: Date, deadline: number): Promise<RunResult> {
  const out: RunResult = { settled: 0, notices: 0, debits: 0, ended: 0, orders: 0, refunds: 0, cancels: 0, emails: 0, stale: 0 }
  const live = () => Date.now() < deadline
  const configured = isBillingGatewayConfigured(), test = billingGatewayIsTest()
  // Live keys move real money only on Production (security review 2026-11-23): anywhere else they touch nothing.
  const money = configured && (test || realMoney())
  // Webhook events stored but not applied (a failed after(), a busy invoice counter): they may settle what follows.
  await step('events', async () => { for (const id of await billingUnapplied(5)) { if (!live()) break; await applyBillingEvent(id).catch((e) => console.error('[credits] apply event', errName(e))) } })
  await step('stale', async () => { for (const id of await system.staleUses(STALE_USE_MINUTES, 100)) { if (!live()) break; if (await system.returnUse(id, 'timeout')) out.stale++ } })
  if (money) {
    await step('settle', async () => { out.settled = await settleStragglers(now, live) })
    await step('renewals', async () => { const r = await renewals(now, test, live); out.notices = r.notices; out.debits = r.debits; out.ended = r.ended })
    await step('orders', async () => { out.orders = await renewalOrders(live) })
    await step('refunds', async () => { out.refunds = await refunds(test, live) })
    await step('cancels', async () => { out.cancels = await cancels(live) })
  }
  await step('emails', async () => { out.emails = await sendCreditEmails(now, live) })
  return out
}

async function step(name: string, run: () => Promise<void>) {
  try { await run() } catch (e) { console.error(`[credits] ${name}`, errName(e)) }
}

/** 1. Attempts with no answer after 2 hours (a lost webhook, a closed tab): the gateway decides. */
async function settleStragglers(now: Date, live: () => boolean): Promise<number> {
  let n = 0
  for (const u of await system.unsettled(120, 50)) {
    if (!live()) break
    try {
      const order = u.orderId ?? (await orderByReceipt(u.receipt))?.id ?? null
      if (!order) { if (await system.close(u.id, 'Not paid. Nothing was charged.')) n++; continue }
      const items = (await orderPayments(order)).items
      const p = items.find((x) => x.status === 'captured') ?? items.find((x) => x.status === 'failed')
      if (p) {
        const r = await system.apply({ order, payment: p.id, captured: p.status === 'captured', amount: p.amount, currency: p.currency, test: billingGatewayIsTest(),
          reason: p.error_description ?? null, token: p.token_id ?? null })
        if (r !== 'unknown') n++
      } else if (items.length === 0 && now.getTime() - u.createdAt.getTime() > DAY) {
        // A day with no payment at all: nothing was taken. A pending one is listed and waits.
        if (await system.close(u.id, 'Not paid. Nothing was charged.')) n++
      }
    } catch (e) { console.error('[credits] settle', u.id, errName(e)) }
  }
  return n
}

const seatOf = (r: RenewalRow): Seat => ({ plan: r.plan, periodEnd: r.periodEnd, cancelAt: r.cancelAt, failedAt: r.failedAt, endedAt: null, nextPlan: r.nextPlan })

/** 2. Each live seat near its period's end. */
async function renewals(now: Date, gatewayIsTest: boolean, live: () => boolean) {
  const out = { notices: 0, debits: 0, ended: 0 }
  const seller = frrataSeller(now)
  // Page through every seat near its end until the deadline: failed seats never crowd out the ones due (speed review).
  for (let page = await system.renewals(100); page.length; page = page.length < 100 ? [] : await system.renewals(100, page[page.length - 1]!)) {
  for (const r of page) {
    if (!live()) return out
    try {
      // Real money against a test invoice is never taken (security M2): a broken seller config waits.
      if (seller.test && !gatewayIsTest) continue
      const plan = renewalPlan(seatOf(r))
      // Place of supply: the buyer's state today (the definer refuses heads that don't match it).
      const q = quote({ kind: 'seat', plan }, seller.gstin, r.buyerState)!
      // A mandate too small for the next plan can't renew it: the partner approves the new limit (Start Studio Plus).
      const mandate = r.mandate && r.mandateMax !== null && q.total <= r.mandateMax
      const s = renewalStep({ seat: seatOf(r), method: r.method, attempts: r.attempts, pending: r.pending, noticeQueuedAt: r.noticeQueuedAt,
        noticeSentAt: r.noticeSentAt, lastFailedAt: r.lastFailedAt, mandate, partnerLive: r.partnerLive, testMode: r.test }, now, gatewayIsTest)
      if (s.kind === 'notice') {
        const id = await system.renewalBegin({ seatId: r.seatId, periodEnd: r.periodEnd, attempt: r.attempts + 1, debitAfter: new Date(s.debitAt.getTime() + ORDER_PASS_MS), plan, credits: SEAT_PLANS[plan].credits,
          taxable: q.taxable, cgst: q.cgst, sgst: q.sgst, igst: q.igst, invoiceTest: seller.test || r.test,
          seller: { name: seller.name, gstin: seller.gstin, address: seller.address, sac: seller.sac, prefix: seller.prefix, fy: seller.fy } })
        if (id) out.notices++
      } else if (s.kind === 'debit' && r.purchaseId && r.purchaseOpen && r.hasOrder) {
        if ((await debit(r.purchaseId)) === 'charged') out.debits++
      } else if (s.kind === 'end' || s.kind === 'lapse') {
        if (await system.seatEnd(r.seatId, s.kind === 'lapse')) out.ended++
      }
    } catch (e) { console.error('[credits] renewal', r.seatId, errName(e)) }
  }
  }
  return out
}

/** One recurring debit: claimed once, ever (never resent); its outcome from the gateway or the webhook. */
async function debit(purchaseId: string): Promise<'charged' | 'skipped'> {
  const ctx = await system.ctx(purchaseId)
  if (!ctx?.orderId || !ctx.customerId || !ctx.tokenId || !ctx.open || ctx.claimed) return 'skipped'
  // clock-ok: the debit's own moment, checked against the stored notice time
  if (ctx.debitAfter && ctx.debitAfter.getTime() > Date.now()) return 'skipped'
  if (!(await system.claim(purchaseId))) return 'skipped'
  try {
    const existing = (await orderPayments(ctx.orderId)).items
    if (existing.length) return 'skipped' // in flight or answered: the settle step or the webhook records it
    const charged = await chargeRecurring({ order: ctx.orderId, customer: ctx.customerId, token: ctx.tokenId, amount: ctx.total, description: `Frrata Studio ${ctx.receipt}` })
    const p = await fetchPayment(charged.razorpay_payment_id).catch(() => null)
    if (p && (p.status === 'captured' || p.status === 'failed')) {
      await system.apply({ order: ctx.orderId, payment: p.id, captured: p.status === 'captured', amount: p.amount, currency: p.currency, test: billingGatewayIsTest(),
        reason: p.error_description ?? null, token: null })
    }
    return 'charged'
  } catch (e) {
    // Unknown outcome: never retried from here; the settle step asks the gateway in 2 hours.
    console.error('[credits] debit', purchaseId, errName(e))
    return 'charged'
  }
}

/** 3. A renewal whose email went gets its order with Razorpay's notification; the notice's clock starts now. */
async function renewalOrders(live: () => boolean): Promise<number> {
  let n = 0
  for (const r of await system.renewalsNotified(50)) {
    if (!live()) break
    try {
      // A full notice from now, never less (the definer stores the same as the debit's time when the order is recorded).
      const lead = r.method === 'card' ? CARD_NOTICE_LEAD_MS : NOTICE_LEAD_MS
      const paymentAfter = new Date(Math.max(r.debitAfter.getTime(), Date.now() + lead)) // clock-ok: the order's own moment
      const order = (await orderByReceipt(r.receipt))?.id ?? (await createRenewalOrder({ amount: r.total, receipt: r.receipt, token: r.tokenId, paymentAfter })).id
      if (await system.setOrder(r.id, order, true)) n++
    } catch (e) { console.error('[credits] renewal order', r.id, errName(e)) }
  }
  return n
}

/** 4. Money taken that bought nothing goes back: claimed first, then the request, then recorded. One claimed earlier
 *  that never finished is looked up at the gateway first (Razorpay takes no idempotency key), and sent only if absent. */
async function refunds(gatewayIsTest: boolean, live: () => boolean): Promise<number> {
  let n = 0
  for (const r of await system.refundsDue(20)) {
    if (!live()) break
    if (r.test !== gatewayIsTest) continue
    try {
      if (r.claimed) {
        const made = (await paymentRefunds(r.paymentId)).items.find((x) => x.amount === r.amount)
        if (made) { await system.refundDone(r.id, made.id); n++; continue }
      } else if (!(await system.refundClaim(r.id))) continue
      const made = await refundPayment(r.paymentId, r.amount)
      await system.refundDone(r.id, made.id)
      n++
    } catch (e) { console.error('[credits] refund', r.id, errName(e)) }
  }
  return n
}

/** 5. Mandates no longer used (a seat ended, or a new one replaced it). */
async function cancels(live: () => boolean): Promise<number> {
  let n = 0
  for (const t of await system.tokenCancels(20)) {
    if (!live()) break
    // A mandate with no customer can't be cancelled from here: it stays listed, and the log says so.
    if (!t.customerId) { console.error('[credits] token cancel without a customer', t.partnerId); continue }
    try { await cancelToken(t.customerId, t.tokenId); await system.tokenCancelled(t.partnerId, t.tokenId); n++ }
    catch (e) { console.error('[credits] token cancel', errName(e)) }
  }
  return n
}

const plus = (d: Date, days: number) => new Date(d.getTime() + days * DAY)
const rupees = (v: unknown) => formatInr(paise(Number(v ?? 0)), { decimals: true })

/** The figures each email needs, formatted (words are pure: src/domains/email/partner-credits.ts). */
function facts(n: NoticeRow, forLead: boolean): MailFacts | null {
  const d = n.data
  switch (n.kind) {
    case 'low': return { kind: 'low', balance: String(d.balance ?? 0) }
    case 'budget_80': return d.client ? { kind: 'budget_80', client: d.client, used: String(d.used), budget: String(d.budget), forLead, ownerFirstName: n.ownerName.split(' ')[0] || 'your partner owner' } : null
    case 'predebit': {
      if (!d.debitAfter) return null
      const at = new Date(d.debitAfter)
      return { kind: 'predebit', amount: rupees(d.total), day: dayMonthIN(at), time: timeIN(at), method: d.method === 'card' ? 'card' : 'upi', ref: String(d.mandateRef ?? '').slice(-4),
        plan: SEAT_PLANS[d.plan as 'studio' | 'plus']?.name ?? 'Studio', month: monthLongIN(new Date(d.forPeriodEnd ?? d.debitAfter)) }
    }
    case 'renewal_failed': {
      const failed = new Date(d.failedAt ?? Date.now())
      return { kind: 'renewal_failed', day: dayMonthIN(new Date(d.forPeriodEnd ?? failed)), amount: rupees(d.total),
        retries: RETRY_DAYS.map((x) => dayMonthIN(plus(failed, x))) as [string, string, string], lapseDay: dayMonthIN(plus(failed, LAPSE_DAYS)) }
    }
    case 'paid': return { kind: 'paid', amount: rupees(d.total), what: d.kind === 'pack' || d.kind === 'credits' ? `${d.credits} credits` : `${SEAT_PLANS[d.plan as 'studio' | 'plus']?.name ?? 'Studio'}`, invoice: d.invoiceNumber ?? null }
    case 'details_changed': return d.name ? { kind: 'details_changed', name: d.name } : null
    default: return null
  }
}

/** 6. The partner's emails (ids only in the queue; recipients and figures resolved at claim, tenancy H4). */
export async function sendCreditEmails(now: Date, live: () => boolean): Promise<number> {
  if (!EMAIL_NOTICES_FROM || !isEmailConfigured()) return 0
  let sent = 0
  // Claim again while there is time (speed review: a fixed 30 a run is 720 a day), never the same notice twice a run.
  const seen = new Set<string>()
  for (;;) {
  const batch = (await system.noticesClaim(30)).filter((n) => !seen.has(n.id))
  if (!batch.length) break
  for (const n of batch) {
    seen.add(n.id)
    if (!live()) return sent
    const to = [...n.owners.map((e) => ({ e, lead: false })), ...n.leads.filter((e) => !n.owners.includes(e)).map((e) => ({ e, lead: true }))]
    let ok = to.length > 0, code: string | null = to.length ? null : 'no_recipient'
    for (const r of to) {
      const f = facts(n, r.lead)
      if (!f) { ok = false; code = 'no_facts'; break }
      const w = creditMail(f)
      const mail = frrataEmail({ preview: w.subject, heading: w.subject, message: w.body,
        button: w.button ? { label: w.button.label, href: `https://${CONSOLE_HOST}${w.button.path}` } : null,
        footer: 'Sent by Frrata about your partner workspace’s Studio credits.' })
      const s = await sendEmail({ from: EMAIL_NOTICES_FROM, to: r.e, replyTo: null, subject: w.subject.slice(0, 150), html: mail.html, text: mail.text,
        configurationSet: SES_CONFIG_NOTICES, tenant: 'frrata', messageId: randomUUID(), tenantTag: 'partner' }, now)
        .catch((e) => { console.error('[credits] email', errName(e)); return { ok: false as const, retry: true, code: 'network' } })
      if (!s.ok) { ok = false; code = s.code; break }
    }
    await system.noticeDone(n.id, ok, code)
    if (ok) sent++
  }
  if (batch.length < 30) break
  }
  return sent
}
