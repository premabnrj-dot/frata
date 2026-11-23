import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'
import { errName } from '@/lib/log'
import { paise, type Paise } from '@/domains/money/paise'
import type { SeatPlan } from '@/domains/studio/prices'
import type { NoticeKind, PurchaseKind, UseWhat } from '@/domains/studio/ledger'
import type { Caller } from './partners'

// =============================================================================
// FILE: src/lib/db/partner-credits.ts — STUDIO CREDITS, THE DEFINERS' ONLY CALLER (C1·2; drizzle/0164; proof
// tenancy.sql § 89). Two families here:
//   - PERSON (a Caller: user, session, step-up): the partner comes from the caller's live membership inside each definer;
//     a link, invoice or purchase id is matched on that partner ('not_found' otherwise). Writes are counted first.
//   - SYSTEM (ids only): applying a payment the server fetched or a verified webhook stored, the hourly run's work, the
//     door's settle and return. Exported under `system`, imported only where check:actions allows (src/lib/studio/**,
//     the billing webhook, the credits cron).
// Errors are logged by name only (S10).
// =============================================================================

const CODES = ['not_owner', 'not_found', 'bad_input', 'bad_gstin', 'too_many', 'confirm_first', 'confirm_again', 'details_first', 'has_seat',
  'no_seat', 'below_used', 'gstin_locked', 'rate', 'platform_day', 'person_day', 'budget', 'balance', 'renewal_paying', 'start_open'] as const
export type CreditError = (typeof CODES)[number] | 'unknown'

function code(err: unknown, tag: string): CreditError {
  const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
  const c = CODES.find((k) => msg === k)
  if (!c) console.error(`[${tag}]`, errName(err))
  return c ?? 'unknown'
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: CreditError }
const who = (c: Caller) => sql`${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}`
const num = (v: unknown) => Number(v ?? 0)
const date = (v: unknown) => (v ? new Date(v as string) : null)

/** A read that may refuse in words (not_owner for a Lead on the owner's pages, and so on). */
async function read<T>(tag: string, run: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await run() } } catch (err) { return { ok: false, error: code(err, tag) } }
}

/** A person write, counted first in its own statement (a refused write still counts; security L1). */
async function counted<T>(c: Caller, kind: string, tag: string, run: () => Promise<T>): Promise<Result<T>> {
  try {
    await db().execute(sql`select app_partner_credit_try(${who(c)}, ${kind})`)
    return { ok: true, value: await run() }
  } catch (err) {
    return { ok: false, error: code(err, tag) }
  }
}

// ── Person reads ────────────────────────────────────────────────────────────────────────────────────────────────────

export type LotView = { kind: string; left: number; credits: number; expiresAt: Date; createdAt: Date; test: boolean }
export type SeatView = { plan: SeatPlan; nextPlan: SeatPlan | null; method: 'upi' | 'card'; test: boolean; startedAt: Date; periodEnd: Date; cancelAt: Date | null; failedAt: Date | null }
export type Overview = {
  balance: number; held: number; heldBy: number; used: number; usedSince: Date; lots: LotView[]; seat: SeatView | null
  mandate: { method: 'upi' | 'card'; max: Paise; live: boolean } | null; alerts: { low: boolean; budget: boolean }
  hasDetails: boolean; hasInvoices: boolean; newSiteBudget: number
  waiting: { id: string; kind: PurchaseKind; total: Paise; createdAt: Date } | null
  renewalFailed: { total: Paise; forPeriodEnd: Date; failedAt: Date } | null
  /** The live seat's renewal for this period, open: Move to Studio Plus stops it, or waits while it is with the bank (C1·B). */
  renewalOpen: { total: Paise; forPeriodEnd: Date; claimed: boolean } | null
  /** An old mandate still being cancelled. */
  cancelling: boolean
}

export function overview(c: Caller, realMoney: boolean): Promise<Result<Overview>> {
  return read('credits-overview', async () => {
    const [r] = await db().execute<{ j: Record<string, any> }>(sql`select app_partner_credits_overview(${who(c)}, ${realMoney}) as j`)
    const j = r!.j
    return {
      balance: num(j.balance), held: num(j.held), heldBy: num(j.heldBy), used: num(j.used), usedSince: new Date(j.usedSince),
      lots: (j.lots as any[]).map((l) => ({ kind: l.kind, left: num(l.left), credits: num(l.credits), expiresAt: new Date(l.expiresAt), createdAt: new Date(l.createdAt), test: !!l.test })),
      seat: j.seat ? { plan: j.seat.plan, nextPlan: j.seat.nextPlan ?? null, method: j.seat.method, test: !!j.seat.test, startedAt: new Date(j.seat.startedAt),
        periodEnd: new Date(j.seat.periodEnd), cancelAt: date(j.seat.cancelAt), failedAt: date(j.seat.failedAt) } : null,
      mandate: j.mandate ? { method: j.mandate.method, max: paise(num(j.mandate.max)), live: !!j.mandate.live } : null,
      alerts: { low: j.alerts?.low !== false, budget: j.alerts?.budget !== false },
      hasDetails: !!j.hasDetails, hasInvoices: !!j.hasInvoices, newSiteBudget: num(j.newSiteBudget ?? 300),
      waiting: j.waiting ? { id: j.waiting.id, kind: j.waiting.kind, total: paise(num(j.waiting.total)), createdAt: new Date(j.waiting.createdAt) } : null,
      renewalFailed: j.renewalFailed ? { total: paise(num(j.renewalFailed.total)), forPeriodEnd: new Date(j.renewalFailed.forPeriodEnd), failedAt: new Date(j.renewalFailed.failedAt) } : null,
      renewalOpen: j.renewalOpen ? { total: paise(num(j.renewalOpen.total)), forPeriodEnd: new Date(j.renewalOpen.forPeriodEnd), claimed: !!j.renewalOpen.claimed } : null,
      cancelling: !!j.cancelling,
    }
  })
}

export type UseRow = { id: string; at: Date; kind: 'preview' | 'turn'; what: UseWhat; client: string; who: string | null; estimate: number | null; reserved: number; charged: number; closed: boolean; returned: boolean }
export type Usage = { uses: UseRow[]; added: { at: Date; kind: string; credits: number }[]; ended: { at: Date; kind: string; credits: number }[] }

/** One IST month of uses (owner), at most `limit`, newest first; `linkId` narrows to one client. */
export function usage(c: Caller, month: string, linkId: string | null, limit: number, before: Date | null = null): Promise<Result<Usage>> {
  return read('credits-usage', async () => {
    const [r] = await db().execute<{ j: Record<string, any> }>(sql`select app_partner_credits_usage(${who(c)}, ${month}::date, ${linkId}::uuid, ${limit}, ${before?.toISOString() ?? null}::timestamptz) as j`)
    const j = r!.j
    return {
      uses: (j.uses as any[]).map((u) => ({ id: u.id, at: new Date(u.at), kind: u.kind, what: u.what, client: u.client, who: u.who ?? null, estimate: u.estimate ?? null,
        reserved: num(u.reserved), charged: num(u.charged), closed: !!u.closed, returned: !!u.returned })),
      added: (j.added as any[]).map((a) => ({ at: new Date(a.at), kind: a.kind, credits: num(a.credits) })),
      ended: (j.ended as any[]).map((a) => ({ at: new Date(a.at), kind: a.kind, credits: num(a.credits) })),
    }
  })
}

export type BudgetRow = { linkId: string; client: string; kind: 'build' | 'month'; budget: number | null; used: number; warned: boolean }
/** Client budgets: the owner's every live client, a Lead's assigned ones (the owner's "New websites start at" is on the overview). */
export function budgets(c: Caller): Promise<Result<BudgetRow[]>> {
  return read('credits-budgets', async () => {
    const rows = await db().execute<Record<string, unknown>>(sql`select * from app_partner_credits_budgets(${who(c)})`)
    return rows.map((r) => ({ linkId: r.link_id as string, client: r.client as string, kind: r.kind as 'build' | 'month', budget: r.budget === null ? null : num(r.budget), used: num(r.used), warned: r.warned === true }))
  })
}

export type PurchaseRow = { id: string; at: Date; kind: PurchaseKind; credits: number; plan: SeatPlan | null; total: Paise; test: boolean
  paidAt: Date | null; failedAt: Date | null; closedAt: Date | null; sent: boolean; refundDue: boolean; refundedAt: Date | null; invoiceId: string | null; invoiceNumber: string | null }
export type Details = { legalName: string | null; gstin: string | null; stateCode: string | null; address: string | null; email: string | null; gstinLocked: boolean }
export type Payments = { purchases: PurchaseRow[]; details: Details | null; mandate: { method: 'upi' | 'card'; max: Paise; live: boolean } | null; cancelling: boolean }

export function payments(c: Caller): Promise<Result<Payments>> {
  return read('credits-payments', async () => {
    const [r] = await db().execute<{ j: Record<string, any> }>(sql`select app_partner_credits_payments(${who(c)}) as j`)
    const j = r!.j
    return {
      purchases: (j.purchases as any[]).map((p) => ({ id: p.id, at: new Date(p.at), kind: p.kind, credits: num(p.credits), plan: p.plan ?? null, total: paise(num(p.total)),
        test: !!p.test, paidAt: date(p.paid_at), failedAt: date(p.failed_at), closedAt: date(p.closed_at), sent: !!p.sent, refundDue: !!p.refund_due_at,
        refundedAt: date(p.refunded_at), invoiceId: p.invoice_id ?? null, invoiceNumber: p.invoice_number ?? null })),
      details: j.details ? { legalName: j.details.legalName ?? null, gstin: j.details.gstin ?? null, stateCode: j.details.stateCode ?? null, address: j.details.address ?? null,
        email: j.details.email ?? null, gstinLocked: !!j.details.gstinLocked } : null,
      mandate: j.mandate ? { method: j.mandate.method, max: paise(num(j.mandate.max)), live: !!j.mandate.live } : null,
      cancelling: !!j.cancelling,
    }
  })
}

export type InvoiceRow = { id: string; number: string; test: boolean; issuedAt: Date; buyerName: string; buyerGstin: string | null; buyerState: string; buyerAddress: string
  placeOfSupply: string; sellerName: string; sellerGstin: string | null; sellerAddress: string; sac: string; kind: PurchaseKind; plan: SeatPlan | null; credits: number
  taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; total: Paise }

/** One invoice for its PDF (owner): 'not_found' for another partner's. Counted as a 'pdf' read. */
export function invoice(c: Caller, id: string): Promise<Result<InvoiceRow>> {
  return counted(c, 'pdf', 'credits-invoice', async () => {
    const [r] = await db().execute<Record<string, unknown>>(sql`select * from app_partner_invoice(${who(c)}, ${id}::uuid)`)
    if (!r) throw new Error('not_found')
    return { id: r.id as string, number: r.number as string, test: r.test === true, issuedAt: new Date(r.issued_at as string), buyerName: r.buyer_name as string,
      buyerGstin: (r.buyer_gstin as string | null) ?? null, buyerState: r.buyer_state as string, buyerAddress: r.buyer_address as string,
      placeOfSupply: r.place_of_supply as string, sellerName: r.seller_name as string, sellerGstin: (r.seller_gstin as string | null) ?? null,
      sellerAddress: r.seller_address as string, sac: r.sac as string, kind: r.kind as PurchaseKind, plan: (r.plan as SeatPlan | null) ?? null, credits: num(r.credits),
      taxable: paise(num(r.taxable)), cgst: paise(num(r.cgst)), sgst: paise(num(r.sgst)), igst: paise(num(r.igst)), total: paise(num(r.total)) }
  })
}

export type Panel = { role: 'owner' | 'lead' | 'builder'; balance: number | null; kind: 'build' | 'month'; budget: number | null; used: number }
/** Studio's credits panel for one client (owner 2026-11-22, 5): a Lead or Builder never gets the balance. */
export function panel(c: Caller, linkId: string, realMoney: boolean): Promise<Result<Panel>> {
  return read('credits-panel', async () => {
    const [r] = await db().execute<Record<string, unknown>>(sql`select * from app_partner_credits_panel(${who(c)}, ${linkId}::uuid, ${realMoney})`)
    return { role: r!.role as Panel['role'], balance: r!.balance == null ? null : num(r!.balance), kind: r!.kind as Panel['kind'], budget: r!.budget == null ? null : num(r!.budget), used: num(r!.used) }
  })
}

/** A usage CSV is counted (30 an hour), then read like the tab. */
export function usageForCsv(c: Caller, month: string): Promise<Result<Usage>> {
  return counted(c, 'csv', 'credits-csv', async () => {
    const r = await usage(c, month, null, 5_000)
    if (!r.ok) throw new Error(r.error)
    return r.value
  })
}

// ── Person writes (the partner owner's) ─────────────────────────────────────────────────────────────────────────────

export const setBudget = (c: Caller, linkId: string, credits: number) =>
  counted(c, 'budget', 'credits-budget', async () => { await db().execute(sql`select app_partner_set_budget(${who(c)}, ${linkId}::uuid, ${credits})`) })
export const setSiteBudget = (c: Caller, credits: number) =>
  counted(c, 'budget', 'credits-site-budget', async () => { await db().execute(sql`select app_partner_set_site_budget(${who(c)}, ${credits})`) })
export const setAlerts = (c: Caller, low: boolean, budget: boolean) =>
  counted(c, 'alerts', 'credits-alerts', async () => { await db().execute(sql`select app_partner_set_alerts(${who(c)}, ${low}, ${budget})`) })
export const setDetails = (c: Caller, d: { legalName: string; gstin: string | null; stateCode: string | null; address: string; email: string | null }) =>
  counted(c, 'details', 'credits-details', async () => {
    await db().execute(sql`select app_partner_set_billing(${who(c)}, ${d.legalName}, ${d.gstin}, ${d.stateCode}, ${d.address}, ${d.email})`)
  })
export const changeSeat = (c: Caller, action: 'cancel' | 'keep' | 'plan', plan: SeatPlan | null) =>
  counted(c, 'seat', 'credits-seat', async () => { await db().execute(sql`select app_partner_seat_change(${who(c)}, ${action}, ${plan})`) })

export type BuyRow = { kind: 'pack' | 'credits' | 'seat_start'; credits: number; plan: SeatPlan | null; method: 'upi' | 'card' | null; mandateMax: Paise | null
  taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; test: boolean; invoiceTest: boolean
  seller: { name: string; gstin: string | null; address: string; sac: string; prefix: string; fy: string } }

/** The attempt row, committed before the gateway hears of it (ADR-0008). */
export const beginPurchase = (c: Caller, b: BuyRow) =>
  counted(c, b.kind === 'seat_start' ? 'seat' : 'buy', 'credits-buy', async () => {
    const [r] = await db().execute<{ id: string; receipt: string; total: number }>(sql`select * from app_partner_credit_buy(${who(c)}, ${b.kind}, ${b.credits},
      ${b.plan}, ${b.method}, ${b.mandateMax}, ${b.taxable}, ${b.cgst}, ${b.sgst}, ${b.igst}, ${b.test}, ${b.invoiceTest},
      ${b.seller.name}, ${b.seller.gstin ?? ''}, ${b.seller.address}, ${b.seller.sac}, ${b.seller.prefix}, ${b.seller.fy})`)
    return { id: r!.id, receipt: r!.receipt, total: paise(num(r!.total)) }
  })

/** A person's confirm after Checkout: counted, then the server's own fetch decides (src/lib/studio/purchase.ts). */
export const countConfirm = (c: Caller) => counted(c, 'confirm', 'credits-confirm', async () => undefined)

/** The door's reserve: a person starts a preview or a turn (C1·5). */
export function reserve(c: Caller, x: { linkId: string; kind: 'preview' | 'turn'; what: UseWhat; estimate: number | null; realMoney: boolean }): Promise<Result<{ useId: string; reserved: number }>> {
  return read('credits-reserve', async () => {
    const [r] = await db().execute<{ use_id: string; reserved: number }>(sql`select * from app_pc_reserve(${who(c)}, ${x.linkId}::uuid, ${x.kind}, ${x.what}, ${x.estimate}, ${x.realMoney})`)
    return { useId: r!.use_id, reserved: num(r!.reserved) }
  })
}

// ── System (ids only) ───────────────────────────────────────────────────────────────────────────────────────────────

export type PurchaseCtx = { id: string; partnerId: string; kind: PurchaseKind; total: Paise; receipt: string; orderId: string | null; test: boolean; plan: SeatPlan | null
  method: 'upi' | 'card' | null; mandateMax: Paise | null; customerId: string | null; tokenId: string | null; debitAfter: Date | null; claimed: boolean; open: boolean; partnerLive: boolean }
export type ApplyResult = 'applied' | 'failed' | 'refund_due' | 'refund_pending' | 'duplicate' | 'ignored' | 'unknown'
export type RenewalRow = { seatId: string; partnerId: string; plan: SeatPlan; nextPlan: SeatPlan | null; method: 'upi' | 'card'; test: boolean; periodEnd: Date
  cancelAt: Date | null; failedAt: Date | null; attempts: number; pending: number; purchaseId: string | null; purchaseOpen: boolean; hasOrder: boolean
  noticeQueuedAt: Date | null; noticeSentAt: Date | null; lastFailedAt: Date | null; mandate: boolean; mandateMax: Paise | null; partnerLive: boolean
  /** The buyer's state today: the renewal's place of supply. */
  buyerState: string | null }
export type NoticeRow = { id: string; kind: NoticeKind; partnerId: string; owners: string[]; leads: string[]; ownerName: string; data: Record<string, any> }

export const system = {
  async ctx(purchaseId: string): Promise<PurchaseCtx | null> {
    const [r] = await db().execute<Record<string, unknown>>(sql`select * from app_pc_purchase_ctx(${purchaseId}::uuid)`)
    if (!r) return null
    return { id: r.id as string, partnerId: r.partner_id as string, kind: r.kind as PurchaseKind, total: paise(num(r.total)), receipt: r.receipt as string,
      orderId: (r.gateway_order_id as string | null) ?? null, test: r.test === true, plan: (r.plan as SeatPlan | null) ?? null, method: (r.method as 'upi' | 'card' | null) ?? null,
      mandateMax: r.mandate_max == null ? null : paise(num(r.mandate_max)), customerId: (r.customer_id as string | null) ?? null, tokenId: (r.token_id as string | null) ?? null,
      debitAfter: date(r.debit_after), claimed: r.claimed === true, open: r.open === true, partnerLive: r.partner_live === true }
  },
  async setCustomer(purchaseId: string, customer: string): Promise<string | null> {
    const [r] = await db().execute<{ customer_id: string | null }>(sql`select app_pc_set_customer(${purchaseId}::uuid, ${customer}) as customer_id`)
    return r?.customer_id ?? null
  },
  async setOrder(purchaseId: string, order: string, notified: boolean): Promise<boolean> {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_pc_purchase_order(${purchaseId}::uuid, ${order}, ${notified}) as ok`)
    return r?.ok === true
  },
  async claim(purchaseId: string): Promise<boolean> {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_pc_claim(${purchaseId}::uuid) as ok`)
    return r?.ok === true
  },
  async apply(p: { order: string; payment: string; captured: boolean; amount: number; currency: string; test: boolean; reason: string | null; token: string | null }): Promise<ApplyResult> {
    const [r] = await db().execute<{ r: ApplyResult }>(sql`select app_pc_apply(${p.order}, ${p.payment}, ${p.captured}, ${p.amount}, ${p.currency}, ${p.test}, ${p.reason}, ${p.token}) as r`)
    return r!.r
  },
  async unsettled(olderMinutes: number, limit: number): Promise<{ id: string; receipt: string; orderId: string | null; kind: PurchaseKind; claimed: boolean; createdAt: Date }[]> {
    const rows = await db().execute<Record<string, unknown>>(sql`select * from app_pc_unsettled(make_interval(mins => ${olderMinutes}), ${limit})`)
    return rows.map((r) => ({ id: r.id as string, receipt: r.receipt as string, orderId: (r.gateway_order_id as string | null) ?? null, kind: r.kind as PurchaseKind,
      claimed: r.claimed === true, createdAt: new Date(r.created_at as string) }))
  },
  async close(purchaseId: string, reason: string): Promise<boolean> {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_pc_close(${purchaseId}::uuid, ${reason}) as ok`)
    return r?.ok === true
  },
  /** One page of seats near their end or failed, in (period end, id) order; pass the last row to read the next. */
  async renewals(limit: number, after: { periodEnd: Date; seatId: string } | null = null): Promise<RenewalRow[]> {
    const rows = await db().execute<Record<string, unknown>>(sql`select * from app_pc_renewals(${limit}, ${after ? after.periodEnd.toISOString() : null}::timestamptz, ${after?.seatId ?? null}::uuid)`)
    return rows.map((r) => ({ seatId: r.seat_id as string, partnerId: r.partner_id as string, plan: r.plan as SeatPlan, nextPlan: (r.next_plan as SeatPlan | null) ?? null,
      method: r.method as 'upi' | 'card', test: r.test === true, periodEnd: new Date(r.period_end as string), cancelAt: date(r.cancel_at), failedAt: date(r.failed_at),
      attempts: num(r.attempts), pending: num(r.pending), purchaseId: (r.purchase_id as string | null) ?? null, purchaseOpen: r.purchase_open === true,
      hasOrder: r.has_order === true, noticeQueuedAt: date(r.notice_queued_at), noticeSentAt: date(r.notice_sent_at), lastFailedAt: date(r.last_failed_at),
      mandate: r.mandate === true, mandateMax: r.mandate_max == null ? null : paise(num(r.mandate_max)), partnerLive: r.partner_live === true,
      buyerState: (r.buyer_state as string | null) ?? null }))
  },
  async renewalBegin(x: { seatId: string; periodEnd: Date; attempt: number; debitAfter: Date; plan: SeatPlan; credits: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise
    invoiceTest: boolean; seller: BuyRow['seller'] }): Promise<string | null> {
    const [r] = await db().execute<{ id: string | null }>(sql`select app_pc_renewal_begin(${x.seatId}::uuid, ${x.periodEnd.toISOString()}::timestamptz, ${x.attempt},
      ${x.debitAfter.toISOString()}::timestamptz, ${x.plan}, ${x.credits}, ${x.taxable}, ${x.cgst}, ${x.sgst}, ${x.igst}, ${x.invoiceTest}, ${x.seller.name},
      ${x.seller.gstin ?? ''}, ${x.seller.address}, ${x.seller.sac}, ${x.seller.prefix}, ${x.seller.fy}) as id`)
    return r?.id ?? null
  },
  async renewalsNotified(limit: number): Promise<{ id: string; receipt: string; total: Paise; customerId: string | null; tokenId: string; debitAfter: Date; method: 'upi' | 'card' }[]> {
    const rows = await db().execute<Record<string, unknown>>(sql`select * from app_pc_renewals_notified(${limit})`)
    return rows.map((r) => ({ id: r.id as string, receipt: r.receipt as string, total: paise(num(r.total)), customerId: (r.customer_id as string | null) ?? null,
      tokenId: r.token_id as string, debitAfter: new Date(r.debit_after as string), method: r.method === 'card' ? 'card' : 'upi' }))
  },
  async seatEnd(seatId: string, lapsed: boolean): Promise<boolean> {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_pc_seat_end(${seatId}::uuid, ${lapsed}) as ok`)
    return r?.ok === true
  },
  async tokenCancels(limit: number): Promise<{ partnerId: string; customerId: string | null; tokenId: string }[]> {
    const rows = await db().execute<Record<string, unknown>>(sql`select * from app_pc_token_cancels(${limit})`)
    return rows.map((r) => ({ partnerId: r.partner_id as string, customerId: (r.customer_id as string | null) ?? null, tokenId: r.token_id as string }))
  },
  async tokenCancelled(partnerId: string, token: string) { await db().execute(sql`select app_pc_token_cancelled(${partnerId}::uuid, ${token})`) },
  /** A cancel that failed: its tries and reason kept for staff, tried again next hour. */
  async tokenCancelTried(partnerId: string, token: string, error: string) { await db().execute(sql`select app_pc_token_cancel_tried(${partnerId}::uuid, ${token}, ${error.slice(0, 40)})`) },
  async tokenEvent(token: string, status: string): Promise<boolean> {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_pc_token_event(${token}, ${status}) as ok`)
    return r?.ok === true
  },
  async refundsDue(limit: number): Promise<{ id: string; paymentId: string; amount: Paise; test: boolean; claimed: boolean }[]> {
    const rows = await db().execute<Record<string, unknown>>(sql`select * from app_pc_refunds_due(${limit})`)
    return rows.map((r) => ({ id: r.id as string, paymentId: r.payment_id as string, amount: paise(num(r.amount)), test: r.test === true, claimed: r.claimed === true }))
  },
  async refundClaim(purchaseId: string): Promise<boolean> {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_pc_refund_claim(${purchaseId}::uuid) as ok`)
    return r?.ok === true
  },
  async refundDone(purchaseId: string, refundId: string) { await db().execute(sql`select app_pc_refund_done(${purchaseId}::uuid, ${refundId})`) },
  async dispute(paymentId: string): Promise<boolean> {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_pc_dispute(${paymentId}) as ok`)
    return r?.ok === true
  },
  /** `skip`: notices this run already tried, so a second claim never spends a second try on them. */
  async noticesClaim(limit: number, skip: string[] = []): Promise<NoticeRow[]> {
    const rows = await db().execute<Record<string, unknown>>(sql`select * from app_pc_notices_claim(${limit}, ${`{${skip.join(',')}}`}::uuid[])`)
    return rows.map((r) => ({ id: r.id as string, kind: r.kind as NoticeKind, partnerId: r.partner_id as string, owners: (r.owners as string[] | null) ?? [],
      leads: (r.leads as string[] | null) ?? [], ownerName: (r.owner_name as string | null) ?? '', data: (r.data as Record<string, any>) ?? {} }))
  },
  async noticeDone(id: string, ok: boolean, error: string | null) { await db().execute(sql`select app_pc_notice_done(${id}::uuid, ${ok}, ${error})`) },
  async rateLatest(): Promise<{ day: Date; rateE4: number } | null> {
    const [r] = await db().execute<{ day: string; rate_e4: number }>(sql`select * from app_fx_rate_latest()`)
    return r ? { day: new Date(r.day), rateE4: num(r.rate_e4) } : null
  },
  async settle(useId: string, listMicro: bigint): Promise<number | null> {
    const [r] = await db().execute<{ n: number | null }>(sql`select app_pc_settle(${useId}::uuid, ${listMicro.toString()}::bigint) as n`)
    return r?.n == null ? null : num(r.n)
  },
  async staleUses(olderMinutes: number, limit: number): Promise<string[]> {
    const rows = await db().execute<{ id: string }>(sql`select id from app_pc_stale_uses(${`${Math.max(60, Math.floor(olderMinutes))} minutes`}::interval, ${limit})`)
    return rows.map((r) => r.id)
  },
  async returnUse(useId: string, reason: 'frrata' | 'timeout' | 'cancelled'): Promise<boolean> {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_pc_return(${useId}::uuid, ${reason}) as ok`)
    return r?.ok === true
  },
}
