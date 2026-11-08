import 'server-only'
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Bill } from '@/domains/billing/bill'
import { paise } from '@/domains/money/paise'
import { currentPlan, monthlyPrice } from '@/domains/plans/entitlements'
import { gstinState } from '@/domains/tax/gst'
import { CAN_MANAGE } from '@/domains/tenancy/roles'
import { nextMonthStartIST } from '@/domains/time/month'
import { draftInvoiceIn } from '@/lib/billing/draft'
import type { Membership } from '@/lib/db/platform'
import { planVersions, plans, shopSettings, tenantPlans } from '@/lib/db/schema'
import { billingAccounts, billingNotices, frrataCreditNotes, frrataInvoiceLines, frrataInvoices, frrataPayments } from '@/lib/db/schema-billing'
import { invoiceState, type InvoiceState } from '@/domains/billing/status'
import { frrataCreditNoteDoc, frrataInvoiceDoc, type FrrataDoc } from '@/domains/billing/document'
import { withTenant } from '@/lib/db/tenant'

// =============================================================================
// FILE: src/lib/queries/billing.ts — WHAT A SHOP READS ABOUT ITS OWN BILL (billing B1; plan finding 9). Money: owners
// and admins only. Every export takes the member and refuses outside CAN_MANAGE, and the gate check:billing-read lets
// only console/settings/billing/** import this module, so staff and partners never reach it.
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
export type Estimate = { invoiceOn: Date; bill: Bill; orders: { number: number; base: number; fee: number; feeBps: number; billableAt: Date }[] } | null | 'busy'

export type BillingOverview = {
  plan: { code: string; name: string; monthlyPrice: number; includedOrders: number; feeBps: number; trialEndsAt: Date | null; custom: boolean } | null
  /** A change waiting to start (a downgrade on the 1st): which plan, when, and whether the shop made it. */
  scheduled: { name: string; startsAt: Date; byShop: boolean } | null
  estimate: Estimate
  invoices: { id: string; number: string; periodStart: Date; total: number; issuedAt: Date; testMode: boolean; state: InvoiceState; due: number; credits: { number: string; total: number }[] }[]
  details: { legalName: string; gstin: string; address: string; stateCode: string; email: string; saved: boolean }
}

export async function billingOverview(m: Pick<Membership, 'tenantId' | 'role'>, now = new Date()): Promise<BillingOverview> {
  mayReadMoney(m)
  const tenantId = m.tenantId
  const invoiceOn = nextMonthStartIST(now)
  const [base, estimate] = await Promise.all([
    withTenant(tenantId, async (tx) => {
      const [history, invoices, [account], [shop], paidRows, creditRows] = await Promise.all([
        tx.select({ startsAt: tenantPlans.startsAt, trialEndsAt: tenantPlans.trialEndsAt, customMonthlyPrice: tenantPlans.customMonthlyPrice, name: plans.name, code: plans.code, reason: tenantPlans.reason,
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
      ])
      return { history, invoices, account, shop, paidRows, creditRows }
    }),
    // The run, rolled back: nothing is written, whatever the page shows.
    (async (): Promise<Estimate> => {
      let out: Estimate = null
      await withTenant(tenantId, async (tx) => {
        // The run takes the draft's row lock; a page view waits for it at most 1 s and never holds the run up for long
        // (impact review 2026-11-08): on a timeout the page says the estimate is being updated.
        await tx.execute(sql`set local lock_timeout = '1s'`)
        const r = await draftInvoiceIn(tx, tenantId, invoiceOn, now)
        if (r.invoiceId) out = { invoiceOn, bill: r.bill, orders: r.bill.fees.map((f) => ({ number: r.numbers.get(f.orderId) ?? 0, base: f.base, fee: f.fee, feeBps: f.feeBps, billableAt: f.billableAt })).sort((a, b) => b.number - a.number) }
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
    scheduled: (() => { const f = base.history.find((h) => h.startsAt > now); return f ? { name: f.name, startsAt: f.startsAt, byShop: f.reason === 'Changed by the shop' } : null })(),
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
