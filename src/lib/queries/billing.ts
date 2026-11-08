import 'server-only'
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm'
import type { Bill } from '@/domains/billing/bill'
import { paise } from '@/domains/money/paise'
import { currentPlan, monthlyPrice } from '@/domains/plans/entitlements'
import { CAN_MANAGE } from '@/domains/tenancy/roles'
import { nextMonthStartIST } from '@/domains/time/month'
import { draftInvoiceIn } from '@/lib/billing/draft'
import type { Membership } from '@/lib/db/platform'
import { planVersions, plans, shopSettings, tenantPlans } from '@/lib/db/schema'
import { billingAccounts, frrataInvoices } from '@/lib/db/schema-billing'
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

export type Estimate = { invoiceOn: Date; bill: Bill; orders: { number: number; base: number; fee: number; feeBps: number }[] } | null

export type BillingOverview = {
  plan: { name: string; monthlyPrice: number; includedOrders: number; feeBps: number; trialEndsAt: Date | null } | null
  estimate: Estimate
  invoices: { id: string; number: string; periodStart: Date; total: number; issuedAt: Date }[]
  details: { legalName: string; gstin: string; address: string; stateCode: string; email: string; saved: boolean }
}

export async function billingOverview(m: Pick<Membership, 'tenantId' | 'role'>, now = new Date()): Promise<BillingOverview> {
  mayReadMoney(m)
  const tenantId = m.tenantId
  const invoiceOn = nextMonthStartIST(now)
  const [base, estimate] = await Promise.all([
    withTenant(tenantId, async (tx) => {
      const [history, invoices, [account], [shop]] = await Promise.all([
        tx.select({ startsAt: tenantPlans.startsAt, trialEndsAt: tenantPlans.trialEndsAt, customMonthlyPrice: tenantPlans.customMonthlyPrice, name: plans.name,
          monthlyPrice: planVersions.monthlyPrice, includedOrders: planVersions.includedOrders, feeBps: planVersions.feeBps })
          .from(tenantPlans).innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId)).innerJoin(plans, eq(plans.id, planVersions.planId))
          .where(eq(tenantPlans.tenantId, tenantId)).orderBy(asc(tenantPlans.startsAt)),
        tx.select({ id: frrataInvoices.id, number: frrataInvoices.number, periodStart: frrataInvoices.periodStart, total: frrataInvoices.total, issuedAt: frrataInvoices.issuedAt })
          .from(frrataInvoices).where(and(eq(frrataInvoices.tenantId, tenantId), isNotNull(frrataInvoices.issuedAt))).orderBy(desc(frrataInvoices.periodStart)).limit(36),
        tx.select({ legalName: billingAccounts.legalName, gstin: billingAccounts.gstin, address: billingAccounts.address, stateCode: billingAccounts.stateCode, email: billingAccounts.email })
          .from(billingAccounts).where(eq(billingAccounts.tenantId, tenantId)),
        tx.select({ legalName: shopSettings.legalName, gstin: shopSettings.gstin, address: shopSettings.address, email: shopSettings.supportEmail }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
      ])
      return { history, invoices, account, shop }
    }),
    // The run, rolled back: nothing is written, whatever the page shows.
    (async (): Promise<Estimate> => {
      let out: Estimate = null
      await withTenant(tenantId, async (tx) => {
        const r = await draftInvoiceIn(tx, tenantId, invoiceOn, now)
        if (r.invoiceId) out = { invoiceOn, bill: r.bill, orders: r.bill.fees.map((f) => ({ number: r.numbers.get(f.orderId) ?? 0, base: f.base, fee: f.fee, feeBps: f.feeBps })).sort((a, b) => b.number - a.number) }
        throw ROLLBACK
      }).catch((e) => { if (e !== ROLLBACK) throw e })
      return out
    })(),
  ])
  const cur = currentPlan(base.history, now)
  const a = base.account, s = base.shop
  return {
    plan: cur ? { name: cur.name, monthlyPrice: monthlyPrice({ planVersion: { monthlyPrice: paise(cur.monthlyPrice) }, customMonthlyPrice: cur.customMonthlyPrice === null ? null : paise(cur.customMonthlyPrice), trialEndsAt: null }, now), includedOrders: cur.includedOrders, feeBps: cur.feeBps, trialEndsAt: cur.trialEndsAt } : null,
    estimate,
    invoices: base.invoices.map((i) => ({ id: i.id, number: i.number ?? '', periodStart: i.periodStart, total: i.total, issuedAt: i.issuedAt! })),
    // Prefilled from Store details until the shop saves its own billing details (spec § Design).
    details: a
      ? { legalName: a.legalName, gstin: a.gstin ?? '', address: a.address, stateCode: a.stateCode ?? '', email: a.email, saved: true }
      : { legalName: s?.legalName ?? '', gstin: s?.gstin ?? '', address: s?.address ?? '', stateCode: s?.gstin ? s.gstin.slice(0, 2) : '', email: s?.email ?? '', saved: false },
  }
}
