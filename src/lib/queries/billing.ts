import 'server-only'
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'
import { GST_BPS, type Bill, type PlanRow } from '@/domains/billing/bill'
import { daysUntil, lastDay, mayExtend, pausesAt, trialEndsAt, trialState, type TrialState } from '@/domains/plans/trial'
import { cache } from 'react'
import { orders } from '@/lib/db/schema-orders'
import { trialFactsIn } from './trial-pause'
import { applyBps, paise, type Paise } from '@/domains/money/paise'
import { currentPlan, monthlyPrice } from '@/domains/plans/entitlements'
import { gstinState } from '@/domains/tax/gst'
import { CAN_MANAGE, managesInPerson } from '@/domains/tenancy/roles'
import { monthStartIST, nextMonthStartIST } from '@/domains/time/month'
import { draftInvoiceIn, planBilledIn } from '@/lib/billing/draft'
import type { Membership } from '@/lib/db/platform'
import { planVersions, plans, shopSettings, tenantPlans } from '@/lib/db/schema'
import { billingAccounts, billingNotices, frrataCreditNotes, frrataFeeCredits, frrataInvoiceFees, frrataInvoiceLines, frrataInvoices, frrataPayments } from '@/lib/db/schema-billing'
import { cheapestPlan, type LadderInvoice, type LadderPlan } from '@/domains/billing/ladder'
import { costBar, deliveredSales } from '@/domains/billing/charges'
import { isModuleKey, MODULES } from '@/domains/modules/registry'
import type { PlanCode } from '@/domains/plans/entitlements'
import { invoiceState, type InvoiceState } from '@/domains/billing/status'
import { frrataCreditNoteDoc, frrataInvoiceDoc, type FrrataDoc } from '@/domains/billing/document'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'

// =============================================================================
// FILE: src/lib/queries/billing.ts — WHAT A SHOP READS ABOUT ITS OWN BILL (billing B1; plan finding 9). Money: owners
// and admins only. Every export takes the member and refuses outside CAN_MANAGE, and the gate check:billing-read lets
// only console/settings/billing/**, the billing banner and the Apps page's one read (src/lib/queries/modules.ts, for
// featuredBillWith) import this module, so staff and partners never reach it.
//
// "This month so far" is the billing run itself (draftInvoiceIn), run inside a transaction that is always rolled
// back: the page shows exactly what the next invoice would bill now, from the one rule, and writes nothing.
// =============================================================================

export class NotForThisRole extends Error {}
const ROLLBACK = new Error('rollback')

function mayReadMoney(m: Pick<Membership, 'role'>) {
  if (!(CAN_MANAGE as readonly string[]).includes(m.role)) throw new NotForThisRole()
}

/** Null: no plan (nothing to bill). 'busy': the billing run is redrafting it this moment. */
export type Estimate = { invoiceOn: Date; bill: Bill; orders: { orderId: string; number: number; base: number; fee: number; feeBps: number; billableAt: Date }[] } | null | 'busy'

export type BillingOverview = {
  plan: { code: string; name: string; monthlyPrice: number; includedOrders: number; feeBps: number; trialEndsAt: Date | null; custom: boolean } | null
  /** A change waiting to start (a downgrade on the 1st): which plan, when, and whether the shop made it. */
  scheduled: { name: string; startsAt: Date; byShop: boolean } | null
  /** For the Change plan dialog (planChangeAdds): the plan rows in force, and what this month's invoice billed for its plan. */
  forChange: { plans: PlanRow[]; billed: number | null; downgradeOn: Date }
  estimate: Estimate
  invoices: { id: string; number: string; periodStart: Date; total: number; issuedAt: Date; testMode: boolean; state: InvoiceState; due: number; credits: { number: string; total: number }[] }[]
  details: { legalName: string; gstin: string; address: string; stateCode: string; email: string; saved: boolean }
  /** The last six issued bills as the cost chart reads them (billing rework R1), newest last. */
  history: HistoryBar[]
  /** Payments that settled or failed, newest first (Payment tab). */
  payments: PaymentRow[]
}

export type HistoryBar = { id: string; number: string; periodStart: Date; testMode: boolean; plan: number; fees: number; taxable: number; sales: number }
export type PaymentRow = { at: Date; method: string; amount: number; number: string; ok: boolean; reason: string | null }

/** The last six issued bills, each as plan + apps and fees less credits, with the delivered sales its fee was on. */
async function historyWith(tx: Tx, t: string): Promise<HistoryBar[]> {
  const inv = await tx.select({ id: frrataInvoices.id, number: frrataInvoices.number, periodStart: frrataInvoices.periodStart, testMode: frrataInvoices.testMode, taxable: frrataInvoices.taxable })
    .from(frrataInvoices).where(and(eq(frrataInvoices.tenantId, t), isNotNull(frrataInvoices.issuedAt))).orderBy(desc(frrataInvoices.periodStart)).limit(6)
  if (!inv.length) return []
  const ids = inv.map((i) => i.id)
  const [lines, fees, credits] = await Promise.all([
    tx.select({ invoiceId: frrataInvoiceLines.invoiceId, kind: frrataInvoiceLines.kind, taxable: frrataInvoiceLines.taxable }).from(frrataInvoiceLines).where(and(eq(frrataInvoiceLines.tenantId, t), inArray(frrataInvoiceLines.invoiceId, ids))),
    tx.select({ invoiceId: frrataInvoiceFees.invoiceId, base: frrataInvoiceFees.base }).from(frrataInvoiceFees).where(and(eq(frrataInvoiceFees.tenantId, t), inArray(frrataInvoiceFees.invoiceId, ids))),
    tx.select({ invoiceId: frrataFeeCredits.invoiceId, base: frrataInvoiceFees.base }).from(frrataFeeCredits)
      .innerJoin(frrataInvoiceFees, and(eq(frrataInvoiceFees.tenantId, frrataFeeCredits.tenantId), eq(frrataInvoiceFees.orderId, frrataFeeCredits.orderId)))
      .where(and(eq(frrataFeeCredits.tenantId, t), inArray(frrataFeeCredits.invoiceId, ids))),
  ])
  const of = <R extends { invoiceId: string }>(rows: R[], id: string) => rows.filter((r) => r.invoiceId === id)
  return inv.flatMap((i) => i.number ? [{ id: i.id, number: i.number, periodStart: i.periodStart, testMode: i.testMode, taxable: i.taxable,
    ...costBar(of(lines, i.id)), sales: deliveredSales(of(fees, i.id), of(credits, i.id)) }] : []).reverse()
}

async function paymentsWith(tx: Tx, t: string): Promise<PaymentRow[]> {
  const rows = await tx.select({ captured: frrataPayments.capturedAt, failed: frrataPayments.failedAt, method: frrataPayments.method, amount: frrataPayments.amount, reason: frrataPayments.failureReason, number: frrataInvoices.number })
    .from(frrataPayments).innerJoin(frrataInvoices, and(eq(frrataInvoices.tenantId, frrataPayments.tenantId), eq(frrataInvoices.id, frrataPayments.invoiceId)))
    .where(and(eq(frrataPayments.tenantId, t), sql`(${frrataPayments.capturedAt} is not null or ${frrataPayments.failedAt} is not null)`))
    .orderBy(desc(sql`coalesce(${frrataPayments.capturedAt}, ${frrataPayments.failedAt})`)).limit(24)
  return rows.map((r) => ({ at: (r.captured ?? r.failed)!, method: r.method, amount: r.amount, number: r.number ?? '', ok: !!r.captured, reason: r.captured ? null : r.reason }))
}

export async function billingOverview(m: Pick<Membership, 'tenantId' | 'role'>, now = new Date()): Promise<BillingOverview> {
  mayReadMoney(m)
  const tenantId = m.tenantId
  const invoiceOn = nextMonthStartIST(now)
  const [base, estimate] = await Promise.all([
    withTenant(tenantId, async (tx) => {
      const [history, invoices, [account], [shop], paidRows, creditRows, planBilled, bars, payments] = await Promise.all([
        tx.select({ startsAt: tenantPlans.startsAt, trialEndsAt: tenantPlans.trialEndsAt, customMonthlyPrice: tenantPlans.customMonthlyPrice, name: plans.name, code: plans.code, byShop: tenantPlans.byShop,
          monthlyPrice: planVersions.monthlyPrice, includedOrders: planVersions.includedOrders, feeBps: planVersions.feeBps })
          .from(tenantPlans).innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId)).innerJoin(plans, eq(plans.id, planVersions.planId))
          .where(eq(tenantPlans.tenantId, tenantId)).orderBy(asc(tenantPlans.startsAt)),
        tx.select({ id: frrataInvoices.id, number: frrataInvoices.number, periodStart: frrataInvoices.periodStart, total: frrataInvoices.total, issuedAt: frrataInvoices.issuedAt, testMode: frrataInvoices.testMode })
          .from(frrataInvoices).where(and(eq(frrataInvoices.tenantId, tenantId), isNotNull(frrataInvoices.issuedAt))).orderBy(desc(frrataInvoices.periodStart)).limit(36),
        tx.select({ legalName: billingAccounts.legalName, gstin: billingAccounts.gstin, address: billingAccounts.address, stateCode: billingAccounts.stateCode, email: billingAccounts.email })
          .from(billingAccounts).where(eq(billingAccounts.tenantId, tenantId)),
        tx.select({ legalName: shopSettings.legalName, gstin: shopSettings.gstin, address: shopSettings.address, email: shopSettings.supportEmail }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
        tx.select({ id: frrataPayments.invoiceId, n: sql<string>`sum(${frrataPayments.amount})` }).from(frrataPayments).where(and(eq(frrataPayments.tenantId, tenantId), isNotNull(frrataPayments.capturedAt))).groupBy(frrataPayments.invoiceId),
        tx.select({ id: frrataCreditNotes.invoiceId, number: frrataCreditNotes.number, total: frrataCreditNotes.total }).from(frrataCreditNotes).where(eq(frrataCreditNotes.tenantId, tenantId)).orderBy(asc(frrataCreditNotes.issuedAt)),
        planBilledIn(tx, tenantId, monthStartIST(now)),
        historyWith(tx, tenantId),
        paymentsWith(tx, tenantId),
      ])
      return { history, invoices, account, shop, paidRows, creditRows, planBilled, bars, payments }
    }),
    // The run, rolled back: nothing is written, whatever the page shows.
    (async (): Promise<Estimate> => {
      let out: Estimate = null
      await withTenant(tenantId, async (tx) => {
        // The run takes the draft's row lock; a page view waits for it at most 1 s and never holds the run up for long
        // (impact review 2026-11-08): on a timeout the page says the estimate is being updated.
        await tx.execute(sql`set local lock_timeout = '1s'`)
        const r = await draftInvoiceIn(tx, tenantId, invoiceOn, now)
        if (r.invoiceId) out = { invoiceOn, bill: r.bill, orders: r.bill.fees.map((f) => ({ orderId: f.orderId, number: r.numbers.get(f.orderId) ?? 0, base: f.base, fee: f.fee, feeBps: f.feeBps, billableAt: f.billableAt })).sort((a, b) => b.number - a.number) }
        throw ROLLBACK
      }).catch((e) => {
        if (e === ROLLBACK) return
        if ((e as { code?: string; cause?: { code?: string } })?.code === '55P03' || (e as { cause?: { code?: string } })?.cause?.code === '55P03') { out = 'busy'; return }
        throw e
      })
      return out
    })(),
  ])
  const cur = currentPlan(base.history, now)
  const a = base.account, s = base.shop
  return {
    plan: cur ? { code: cur.code, custom: cur.customMonthlyPrice !== null, name: cur.name, monthlyPrice: monthlyPrice({ planVersion: { monthlyPrice: paise(cur.monthlyPrice) }, customMonthlyPrice: cur.customMonthlyPrice === null ? null : paise(cur.customMonthlyPrice), trialEndsAt: null }, now), includedOrders: cur.includedOrders, feeBps: cur.feeBps, trialEndsAt: cur.trialEndsAt } : null,
    scheduled: (() => { const f = base.history.find((h) => h.startsAt > now); return f ? { name: f.name, startsAt: f.startsAt, byShop: f.byShop } : null })(),
    forChange: {
      plans: base.history.filter((h) => h.startsAt <= now).map((h) => ({ startsAt: h.startsAt, trialEndsAt: h.trialEndsAt, customMonthlyPrice: h.customMonthlyPrice === null ? null : paise(h.customMonthlyPrice),
        planVersion: { planCode: h.code as PlanRow['planVersion']['planCode'], name: h.name, monthlyPrice: paise(h.monthlyPrice), includedOrders: h.includedOrders, feeBps: h.feeBps } })),
      billed: base.planBilled,
      downgradeOn: nextMonthStartIST(now),
    },
    estimate,
    invoices: base.invoices.flatMap((i) => {
      if (!i.issuedAt || !i.number) return []
      const paid = Number(base.paidRows.find((p) => p.id === i.id)?.n ?? 0)
      const credits = base.creditRows.filter((c) => c.id === i.id).map((c) => ({ number: c.number, total: c.total }))
      return [{ id: i.id, number: i.number, periodStart: i.periodStart, total: i.total, issuedAt: i.issuedAt, testMode: i.testMode, credits, ...invoiceState(i, paid, credits.reduce((t, c) => t + c.total, 0)) }]
    }),
    // Prefilled from Store details until the shop saves its own billing details (spec § Design).
    details: a
      ? { legalName: a.legalName, gstin: a.gstin ?? '', address: a.address, stateCode: a.stateCode ?? '', email: a.email, saved: true }
      : { legalName: s?.legalName ?? '', gstin: s?.gstin ?? '', address: s?.address ?? '', stateCode: gstinState(s?.gstin ?? null) ?? '', email: s?.email ?? '', saved: false },
    history: base.bars,
    payments: base.payments,
  }
}

/** One of the shop's own issued invoices (or a credit note against it) as document data, for its PDF. Owners and admins. */
export async function shopFrrataDocument(m: Pick<Membership, 'tenantId' | 'role'>, invoiceId: string, creditNumber?: string): Promise<FrrataDoc | null> {
  mayReadMoney(m)
  return withTenant(m.tenantId, async (tx) => {
    const [i] = await tx.select().from(frrataInvoices).where(and(eq(frrataInvoices.tenantId, m.tenantId), eq(frrataInvoices.id, invoiceId)))
    if (!i) return null
    const lines = await tx.select({ description: frrataInvoiceLines.description, quantity: frrataInvoiceLines.quantity, taxable: frrataInvoiceLines.taxable }).from(frrataInvoiceLines)
      .where(and(eq(frrataInvoiceLines.tenantId, m.tenantId), eq(frrataInvoiceLines.invoiceId, invoiceId))).orderBy(asc(frrataInvoiceLines.position))
    const doc = frrataInvoiceDoc(i, lines)
    if (!doc || !creditNumber) return doc
    const [cn] = await tx.select().from(frrataCreditNotes).where(and(eq(frrataCreditNotes.tenantId, m.tenantId), eq(frrataCreditNotes.invoiceId, invoiceId), eq(frrataCreditNotes.number, creditNumber)))
    return cn ? frrataCreditNoteDoc(doc, cn) : null
  })
}

export type Paying = {
  mandate: { method: string; max: number; since: Date } | null
  /** The latest notice of a debit not yet taken (amount, when). */
  nextDebit: { amount: number; at: Date } | null
}

/** Autopay as the shop sees it (billing B3): on or off, how and up to what; the next debit announced. Owners and admins. */
export async function payingFor(m: Pick<Membership, 'tenantId' | 'role'>, now = new Date()): Promise<Paying> {
  mayReadMoney(m)
  return withTenant(m.tenantId, async (tx) => {
    const [[a], [n]] = await Promise.all([
      tx.select({ method: billingAccounts.mandateMethod, max: billingAccounts.mandateMax, at: billingAccounts.mandateAt, revoked: billingAccounts.mandateRevokedAt }).from(billingAccounts).where(eq(billingAccounts.tenantId, m.tenantId)),
      tx.select({ amount: billingNotices.amount, at: billingNotices.debitAt }).from(billingNotices)
        .where(and(eq(billingNotices.tenantId, m.tenantId), eq(billingNotices.kind, 'debit_notice'), gt(billingNotices.debitAt, new Date(now.getTime() - 86_400_000)))).orderBy(desc(billingNotices.createdAt)).limit(1),
    ])
    return {
      mandate: a?.method && a.at && !a.revoked ? { method: a.method, max: a.max ?? 0, since: a.at } : null,
      nextDebit: n?.at ? { amount: n.amount, at: n.at } : null,
    }
  })
}

/**
 * The console banner for owners and admins (billing B3; plan finding 9 lets the layout read this): a debit that failed
 * on an invoice still due, or the day-14 acknowledgement. Null otherwise — and always null for anyone else. Never a block.
 */
export async function billingBanner(m: Pick<Membership, 'tenantId' | 'role'>): Promise<{ kind: 'failed' | 'acknowledge'; amount: number; number: string } | null> {
  if (!(CAN_MANAGE as readonly string[]).includes(m.role)) return null
  return withTenant(m.tenantId, async (tx) => {
    const rows = await tx.select({ kind: billingNotices.kind, amount: billingNotices.amount, invoiceId: billingNotices.invoiceId, number: frrataInvoices.number, total: frrataInvoices.total, testMode: frrataInvoices.testMode })
      .from(billingNotices).innerJoin(frrataInvoices, and(eq(frrataInvoices.tenantId, billingNotices.tenantId), eq(frrataInvoices.id, billingNotices.invoiceId)))
      .where(and(eq(billingNotices.tenantId, m.tenantId), inArray(billingNotices.kind, ['failed', 'acknowledge']))).orderBy(desc(billingNotices.createdAt)).limit(1)
    const r = rows[0]
    if (!r || !r.number) return null
    // Shown only while the invoice is still due.
    const [paid] = await tx.select({ n: sql<string>`coalesce(sum(${frrataPayments.amount}), 0)` }).from(frrataPayments).where(and(eq(frrataPayments.tenantId, m.tenantId), eq(frrataPayments.invoiceId, r.invoiceId), isNotNull(frrataPayments.capturedAt)))
    const [cred] = await tx.select({ n: sql<string>`coalesce(sum(${frrataCreditNotes.total}), 0)` }).from(frrataCreditNotes).where(and(eq(frrataCreditNotes.tenantId, m.tenantId), eq(frrataCreditNotes.invoiceId, r.invoiceId)))
    const due = r.total - Number(paid?.n ?? 0) - Number(cred?.n ?? 0)
    return due > 0 ? { kind: r.kind as 'failed' | 'acknowledge', amount: due, number: r.number } : null
  })
}

// ── Trials TR1·6–7: the shop's trial, as the console shows it (one read per request, shared by the banner and Plan and
// billing). Derived from the facts (src/domains/plans/trial.ts); nothing stored. Owners and admins only. ──
export type ShopTrial = { state: TrialState; lastDay: Date; pausesAt: Date; daysLeft: number; plan: string; priceWithGst: number; mayExtend: boolean; extended: boolean }

export const shopTrial = cache(async (m: Pick<Membership, 'tenantId' | 'role'>, now: Date = new Date()): Promise<ShopTrial | null> => {
  if (!(CAN_MANAGE as readonly string[]).includes(m.role)) return null
  return withTenant(m.tenantId, async (tx) => {
    const f = await trialFactsIn(tx, m.tenantId)
    if (!f) return null
    const t = f.facts
    const [plan, [delivered]] = await Promise.all([
      planNowIn(tx, m.tenantId),
      tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, m.tenantId), isNotNull(orders.deliveredAt), sql`${orders.rtoInitiatedAt} is null and ${orders.rtoDeliveredAt} is null`)),
    ])
    const money = { mandateActive: !!f.mandateAt && !f.revokedAt, exposedAt: f.exposedAt }
    const endsAt = trialEndsAt(t)
    const price = Number(plan?.custom ?? plan?.price ?? 0)
    return {
      state: trialState(now, t, money), lastDay: lastDay(endsAt), pausesAt: pausesAt(endsAt, money), daysLeft: daysUntil(now, endsAt),
      plan: plan?.name ?? '', priceWithGst: price + applyBps(paise(price), GST_BPS),
      mayExtend: mayExtend(now, t, delivered?.n ?? 0, money), extended: !!t.extendedAt,
    }
  })
})

/** The plan in force now: its name and monthly price (a custom price wins). Shared by the trial and Settings' row. */
async function planNowIn(tx: Tx, tenantId: string) {
  const [plan] = await tx.select({ name: plans.name, price: planVersions.monthlyPrice, custom: tenantPlans.customMonthlyPrice }).from(tenantPlans)
    .innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId)).innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(and(eq(tenantPlans.tenantId, tenantId), sql`${tenantPlans.startsAt} <= now()`)).orderBy(desc(tenantPlans.startsAt)).limit(1)
  return plan
}

/** Settings' Plan and billing row (Neel § Screens · Settings: "Growth · ₹4,999 a month"). Owners and managers only,
 *  never a support visit (Frrata support does not see billing, § Glossary roles). Name and price only. */
export async function planLine(m: Pick<Membership, 'tenantId' | 'role' | 'supportSessionId'>): Promise<{ name: string; monthlyPrice: Paise } | null | 'not_allowed'> {
  // 'not_allowed' is never "no plan": the row must not say "No plan yet" to someone who may not see it.
  if (!(CAN_MANAGE as readonly string[]).includes(m.role) || m.supportSessionId) return 'not_allowed'
  const plan = await withTenant(m.tenantId, (tx) => planNowIn(tx, m.tenantId))
  return plan ? { name: plan.name, monthlyPrice: paise(Number(plan.custom ?? plan.price)) } : null
}

// ── Apps A2: the featured card (plan docs/plans/2026-11-11-apps-a2-homes.md § 4). Read inside the Apps page's one
// transaction (appsPage), only for owners and admins outside a support visit; null on anything it cannot vouch for. ──
export type FeaturedNudge = { invoiceId: string; periodStart: Date; planCode: string; planName: string; saving: Paise; billed: Paise; would: Paise }

export async function featuredBillWith(tx: Tx, m: Pick<Membership, 'tenantId' | 'role' | 'supportSessionId'>, now: Date): Promise<FeaturedNudge | null> {
  mayReadMoney(m)
  if (!managesInPerson(m)) return null
  const t = m.tenantId
  const [history, latest, invoices] = await Promise.all([
    tx.select({ startsAt: tenantPlans.startsAt, trialEndsAt: tenantPlans.trialEndsAt, custom: tenantPlans.customMonthlyPrice, code: plans.code })
      .from(tenantPlans).innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId)).innerJoin(plans, eq(plans.id, planVersions.planId))
      .where(eq(tenantPlans.tenantId, t)),
    tx.execute<{ code: string; name: string; monthly_price: string; fee_bps: number; features: string[] }>(sql`
      select distinct on (p.code) p.code, p.name, v.monthly_price, v.fee_bps, v.features from ${planVersions} v join ${plans} p on p.id = v.plan_id
       order by p.code, v.version desc`),
    tx.select({ id: frrataInvoices.id, periodStart: frrataInvoices.periodStart, taxable: frrataInvoices.taxable }).from(frrataInvoices)
      .where(and(eq(frrataInvoices.tenantId, t), isNotNull(frrataInvoices.issuedAt), eq(frrataInvoices.testMode, false)))
      .orderBy(desc(frrataInvoices.periodStart)).limit(2),
  ])
  // On Launch now, at its list price, out of any trial, with no change waiting.
  const cur = currentPlan(history, now)
  if (!cur || cur.code !== 'launch' || cur.custom !== null || (cur.trialEndsAt && cur.trialEndsAt > now)) return null
  if (history.some((h) => h.startsAt > now)) return null
  if (invoices.length < 2) return null
  const plan = (code: PlanCode): LadderPlan | null => {
    const r = latest.find((x) => x.code === code)
    // The add-ons this plan includes, by the name their bill line carries (computeBill writes MODULES[k].name).
    return r ? { code, name: r.name, monthlyPrice: paise(Number(r.monthly_price)), feeBps: r.fee_bps,
      includes: r.features.filter(isModuleKey).map((k) => MODULES[k].name) } : null
  }
  const launch = plan('launch')
  const others = (['growth', 'scale'] as const).map(plan).filter((p): p is LadderPlan => p !== null)
  if (!launch || !others.length) return null
  const ids = invoices.map((i) => i.id)
  const [lines, fees, credits] = await Promise.all([
    tx.select({ invoiceId: frrataInvoiceLines.invoiceId, kind: frrataInvoiceLines.kind, periodStart: frrataInvoiceLines.periodStart, taxable: frrataInvoiceLines.taxable, name: frrataInvoiceLines.description })
      .from(frrataInvoiceLines).where(and(eq(frrataInvoiceLines.tenantId, t), inArray(frrataInvoiceLines.invoiceId, ids))),
    tx.select({ invoiceId: frrataInvoiceFees.invoiceId, base: frrataInvoiceFees.base, fee: frrataInvoiceFees.fee })
      .from(frrataInvoiceFees).where(and(eq(frrataInvoiceFees.tenantId, t), inArray(frrataInvoiceFees.invoiceId, ids))),
    tx.select({ invoiceId: frrataFeeCredits.invoiceId, base: frrataInvoiceFees.base, fee: frrataFeeCredits.fee })
      .from(frrataFeeCredits).innerJoin(frrataInvoiceFees, and(eq(frrataInvoiceFees.tenantId, frrataFeeCredits.tenantId), eq(frrataInvoiceFees.orderId, frrataFeeCredits.orderId)))
      .where(and(eq(frrataFeeCredits.tenantId, t), inArray(frrataFeeCredits.invoiceId, ids))),
  ])
  const of = <R extends { invoiceId: string }>(rows: R[], id: string) => rows.filter((r) => r.invoiceId === id)
  const ladder: LadderInvoice[] = invoices.map((i) => ({
    id: i.id, periodStart: i.periodStart, taxable: paise(i.taxable),
    lines: of(lines, i.id).map((l) => ({ kind: l.kind, periodStart: l.periodStart, taxable: paise(l.taxable), name: l.name })),
    fees: of(fees, i.id).map((f) => ({ base: paise(f.base), fee: paise(f.fee) })),
    credits: of(credits, i.id).map((c) => ({ base: paise(c.base), fee: paise(c.fee) })),
  }))
  const n = cheapestPlan(ladder, launch, others)
  return n ? { invoiceId: n.invoiceId, periodStart: n.periodStart, planCode: n.plan.code, planName: n.plan.name, saving: n.saving, billed: n.billed, would: n.would } : null
}

// ── Billing rework R1: the Charges tab — one bill, every rupee traced to an order, a plan or an app. Issued bills read
// their stored rows; the open bill is the Overview's estimate (the same rolled-back run), so the two never disagree. ──
export type ChargeOrder = { number: number; total: number; shippedAt: Date | null; outcome: 'delivered' | 'assumed' | 'came_back' | 'lost'; outcomeAt: Date | null; base: number; feeBps: number; fee: number }
export type IssuedCharges = {
  invoice: { id: string; number: string; periodStart: Date; testMode: boolean; taxable: number; cgst: number; sgst: number; igst: number; total: number }
  lines: { kind: string; description: string; quantity: number; rateBps: number | null; taxable: number }[]
  orders: ChargeOrder[]; orderCount: number; credits: ChargeOrder[]
}
export const CHARGE_PAGE = 50

type Facts = { id: string; number: number; total: number; shippedAt: Date | null; deliveredAt: Date | null; rtoInitiatedAt: Date | null; rtoDeliveredAt: Date | null; lostAt: Date | null }
const outcomeOf = (o: Facts): Pick<ChargeOrder, 'outcome' | 'outcomeAt'> =>
  o.rtoInitiatedAt || o.rtoDeliveredAt ? { outcome: 'came_back', outcomeAt: o.rtoDeliveredAt ?? o.rtoInitiatedAt }
    : o.lostAt ? { outcome: 'lost', outcomeAt: o.lostAt }
      : o.deliveredAt ? { outcome: 'delivered', outcomeAt: o.deliveredAt } : { outcome: 'assumed', outcomeAt: null }
const FACTS = { id: orders.id, number: orders.number, total: orders.total, shippedAt: orders.shippedAt, deliveredAt: orders.deliveredAt, rtoInitiatedAt: orders.rtoInitiatedAt, rtoDeliveredAt: orders.rtoDeliveredAt, lostAt: orders.lostAt }

/** An issued bill of this shop, its lines, one page of its billed orders (newest number first) and its credits. */
export async function issuedCharges(m: Pick<Membership, 'tenantId' | 'role'>, invoiceId: string, page = 0): Promise<IssuedCharges | null> {
  mayReadMoney(m)
  const t = m.tenantId
  return withTenant(t, async (tx) => {
    const [i] = await tx.select({ id: frrataInvoices.id, number: frrataInvoices.number, periodStart: frrataInvoices.periodStart, testMode: frrataInvoices.testMode, taxable: frrataInvoices.taxable,
      cgst: frrataInvoices.cgst, sgst: frrataInvoices.sgst, igst: frrataInvoices.igst, total: frrataInvoices.total, issuedAt: frrataInvoices.issuedAt })
      .from(frrataInvoices).where(and(eq(frrataInvoices.tenantId, t), eq(frrataInvoices.id, invoiceId)))
    if (!i || !i.issuedAt || !i.number) return null
    const [lines, fees, [count], credits] = await Promise.all([
      tx.select({ kind: frrataInvoiceLines.kind, description: frrataInvoiceLines.description, quantity: frrataInvoiceLines.quantity, rateBps: frrataInvoiceLines.rateBps, taxable: frrataInvoiceLines.taxable })
        .from(frrataInvoiceLines).where(and(eq(frrataInvoiceLines.tenantId, t), eq(frrataInvoiceLines.invoiceId, i.id))).orderBy(asc(frrataInvoiceLines.position)),
      tx.select({ ...FACTS, base: frrataInvoiceFees.base, feeBps: frrataInvoiceFees.feeBps, fee: frrataInvoiceFees.fee }).from(frrataInvoiceFees)
        .innerJoin(orders, and(eq(orders.tenantId, frrataInvoiceFees.tenantId), eq(orders.id, frrataInvoiceFees.orderId)))
        .where(and(eq(frrataInvoiceFees.tenantId, t), eq(frrataInvoiceFees.invoiceId, i.id))).orderBy(desc(orders.number)).limit(CHARGE_PAGE).offset(Math.max(0, page) * CHARGE_PAGE),
      tx.select({ n: sql<number>`count(*)::int` }).from(frrataInvoiceFees).where(and(eq(frrataInvoiceFees.tenantId, t), eq(frrataInvoiceFees.invoiceId, i.id))),
      tx.select({ ...FACTS, base: frrataInvoiceFees.base, feeBps: frrataInvoiceFees.feeBps, fee: frrataFeeCredits.fee }).from(frrataFeeCredits)
        .innerJoin(frrataInvoiceFees, and(eq(frrataInvoiceFees.tenantId, frrataFeeCredits.tenantId), eq(frrataInvoiceFees.orderId, frrataFeeCredits.orderId)))
        .innerJoin(orders, and(eq(orders.tenantId, frrataFeeCredits.tenantId), eq(orders.id, frrataFeeCredits.orderId)))
        .where(and(eq(frrataFeeCredits.tenantId, t), eq(frrataFeeCredits.invoiceId, i.id))).orderBy(desc(orders.number)).limit(200),
    ])
    const row = (o: Facts & { base: number; feeBps: number; fee: number }, sign = 1): ChargeOrder => ({ number: o.number, total: o.total, shippedAt: o.shippedAt, ...outcomeOf(o), base: o.base, feeBps: o.feeBps, fee: sign * o.fee })
    return { invoice: { ...i, number: i.number }, lines, orders: fees.map((f) => row(f)), orderCount: count?.n ?? 0, credits: credits.map((c) => row(c, -1)) }
  })
}

/** The open bill's orders as Charges shows them: the estimate's fee rows with each order's total, ship date and outcome. */
export async function openChargeOrders(m: Pick<Membership, 'tenantId' | 'role'>, fees: readonly { orderId: string; base: number; feeBps: number; fee: number }[]): Promise<ChargeOrder[]> {
  mayReadMoney(m)
  if (!fees.length) return []
  const ids = fees.slice(0, 2000).map((f) => f.orderId)
  const facts = await withTenant(m.tenantId, (tx) => tx.select(FACTS).from(orders).where(and(eq(orders.tenantId, m.tenantId), inArray(orders.id, ids))))
  const by = new Map(facts.map((f) => [f.id, f]))
  return fees.flatMap((f) => { const o = by.get(f.orderId); return o ? [{ number: o.number, total: o.total, shippedAt: o.shippedAt, ...outcomeOf(o), base: f.base, feeBps: f.feeBps, fee: f.fee }] : [] })
    .sort((a, b) => b.number - a.number)
}
