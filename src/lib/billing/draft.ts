import 'server-only'
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm'
import { computeBill, type AddonRow, type Bill, type FeeCredit, type FeeOrder, type PlanRow } from '@/domains/billing/bill'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { paise } from '@/domains/money/paise'
import type { PlanCode } from '@/domains/plans/entitlements'
import { gstinState } from '@/domains/tax/gst'
import { monthStartIST, nextMonthStartIST } from '@/domains/time/month'
import type { Tx } from '@/lib/db'
import { billableAtSql } from '@/lib/db/order-predicates'
import { planVersions, plans, tenantPlans } from '@/lib/db/schema'
import { billingAccounts, frrataFeeCredits, frrataInvoiceFees, frrataInvoiceLines, frrataInvoices } from '@/lib/db/schema-billing'
import { addonPrices, tenantAddons } from '@/lib/db/schema-modules'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { frrataGstin } from './seller'

// =============================================================================
// FILE: src/lib/billing/draft.ts — THE BILLING RUN'S DRAFT, one shop at a time (billing B0; plan
// docs/plans/2026-11-08-billing.md § Review findings 1, 8). Runs as frata_app inside the shop (withTenant): reads the
// shop's plan history, add-ons and orders, computes the month with computeBill (pure), and writes the month's draft
// invoice, its lines, a fee row per order billed and a credit row per order credited.
//
// Idempotent by construction: a redraft first removes this month's own draft rows (the database refuses it once the
// invoice is issued), then bills every order billable before the 1st that has no fee row anywhere, and credits every
// fee row whose order is no longer billable and has no credit row. Running it twice writes the same draft.
// =============================================================================


/** `numbers`: each billed or credited order's number, by order id (the page's "which orders"). */
export type Drafted = { invoiceId: string; bill: Bill; numbers: Map<string, number> } | { invoiceId: null; issued: true }

/** Drafts (or redrafts) the invoice for the IST month that `monthStart` begins. */
export async function draftInvoice(tenantId: string, monthStart: Date, now = new Date()): Promise<Drafted> {
  if (monthStartIST(monthStart).getTime() !== monthStart.getTime()) throw new Error('draftInvoice: not the 1st of a month, IST')
  return withTenant(tenantId, (tx) => draftInvoiceIn(tx, tenantId, monthStart, now))
}

/** draftInvoice inside the caller's tenant transaction (the int test rolls it back). */
export async function draftInvoiceIn(tx: Tx, tenantId: string, monthStart: Date, now = new Date()): Promise<Drafted> {
  const nextMonthStart = nextMonthStartIST(monthStart)
  const prevMonthStart = monthStartIST(new Date(monthStart.getTime() - 1))
  // A fee is billed at most one invoice late (an outcome marked after its month closed); older orders are never billed,
  // so a shop's first invoice is not its whole history (impact review 2026-11-08). Nothing in the future is billed.
  const oldest = monthStartIST(new Date(prevMonthStart.getTime() - 1))
  const upTo = new Date(Math.min(monthStart.getTime(), now.getTime()))
  const [existing] = await tx.select({ id: frrataInvoices.id, issuedAt: frrataInvoices.issuedAt }).from(frrataInvoices)
    .where(and(eq(frrataInvoices.tenantId, tenantId), eq(frrataInvoices.periodStart, monthStart))).for('update')
  // Locked: an issue (B2) cannot land between this read and the redraft below.
  if (existing?.issuedAt) return { invoiceId: null, issued: true }
  if (existing) {
    // This month's own rows go first, so its orders and credits are found again below (and only once).
    await tx.delete(frrataInvoiceLines).where(and(eq(frrataInvoiceLines.tenantId, tenantId), eq(frrataInvoiceLines.invoiceId, existing.id)))
    await tx.delete(frrataFeeCredits).where(and(eq(frrataFeeCredits.tenantId, tenantId), eq(frrataFeeCredits.invoiceId, existing.id)))
    await tx.delete(frrataInvoiceFees).where(and(eq(frrataInvoiceFees.tenantId, tenantId), eq(frrataInvoiceFees.invoiceId, existing.id)))
  }

  const at = billableAtSql('o')
  const [planRows, addonRows, feeRows, creditRows, prev, account] = await Promise.all([
    tx.select({ startsAt: tenantPlans.startsAt, trialEndsAt: tenantPlans.trialEndsAt, customMonthlyPrice: tenantPlans.customMonthlyPrice,
      planCode: plans.code, name: plans.name, version: planVersions.version, monthlyPrice: planVersions.monthlyPrice, includedOrders: planVersions.includedOrders, feeBps: planVersions.feeBps })
      .from(tenantPlans).innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId)).innerJoin(plans, eq(plans.id, planVersions.planId))
      .where(eq(tenantPlans.tenantId, tenantId)).orderBy(asc(tenantPlans.startsAt)),
    tx.select({ module: tenantAddons.module, startsAt: tenantAddons.startsAt, endsAt: tenantAddons.endsAt, trialEndsAt: tenantAddons.trialEndsAt, monthlyPrice: addonPrices.monthlyPrice })
      .from(tenantAddons).innerJoin(addonPrices, eq(addonPrices.id, tenantAddons.addonPriceId))
      .where(and(eq(tenantAddons.tenantId, tenantId), lt(tenantAddons.startsAt, nextMonthStart))),
    // Billable before the 1st (and by now), at most one month late, never billed (no fee row on any invoice).
    tx.execute<{ id: string; number: number; at: string | Date; net: string }>(sql`
      select o.id, o.number, ${at} at, o.merchandise_net net from ${orders} o
       where o.tenant_id = ${tenantId} and o.shipped_at is not null and ${at} >= ${oldest.toISOString()}::timestamptz and ${at} < ${upTo.toISOString()}::timestamptz
         and not exists (select 1 from ${frrataInvoiceFees} f where f.order_id = o.id)`),
    // Billed on an ISSUED invoice, no longer billable (came back or lost since), never credited. An unissued draft
    // simply drops such an order when it is redrafted, so a credit never points at a fee a redraft removes.
    tx.execute<{ id: string; number: number; fee: string; invoice: string | null }>(sql`
      select o.id, o.number, f.fee, i.number invoice from ${frrataInvoiceFees} f
        join ${orders} o on o.tenant_id = f.tenant_id and o.id = f.order_id
        join ${frrataInvoices} i on i.tenant_id = f.tenant_id and i.id = f.invoice_id
       where f.tenant_id = ${tenantId} and i.issued_at is not null and i.period_start < ${monthStart.toISOString()}::timestamptz and ${at} is null
         and not exists (select 1 from ${frrataFeeCredits} c where c.order_id = f.order_id)`),
    tx.select({ id: frrataInvoices.id, carryOut: frrataInvoices.carryOut, rolled: frrataInvoices.rolled,
      // B4: what last month's invoice charged in advance for its plan (lines for that month; not its own plan-change line).
      planBilled: sql<string>`coalesce((select sum(l.taxable) from ${frrataInvoiceLines} l where l.tenant_id = ${frrataInvoices.tenantId} and l.invoice_id = ${frrataInvoices.id}
        and l.kind = 'plan' and l.period_start >= ${prevMonthStart.toISOString()}::timestamptz), 0)` }).from(frrataInvoices)
      .where(and(eq(frrataInvoices.tenantId, tenantId), eq(frrataInvoices.periodStart, prevMonthStart))),
    tx.select({ gstin: billingAccounts.gstin, stateCode: billingAccounts.stateCode }).from(billingAccounts).where(eq(billingAccounts.tenantId, tenantId)),
  ])

  const planHistory: PlanRow[] = planRows.map((p) => ({ startsAt: p.startsAt, trialEndsAt: p.trialEndsAt, customMonthlyPrice: p.customMonthlyPrice === null ? null : paise(p.customMonthlyPrice),
    planVersion: { planCode: p.planCode as PlanCode, name: p.name, monthlyPrice: paise(p.monthlyPrice), includedOrders: p.includedOrders, feeBps: p.feeBps } }))
  const addons: AddonRow[] = addonRows.map((a) => ({ module: a.module, name: MODULES[a.module as ModuleKey]?.name ?? a.module, monthlyPrice: paise(a.monthlyPrice), startsAt: a.startsAt, endsAt: a.endsAt, trialEndsAt: a.trialEndsAt }))
  const feeOrders: FeeOrder[] = feeRows.map((o) => ({ orderId: o.id, number: `#${o.number}`, billableAt: new Date(o.at), merchandiseNet: Number(o.net) }))
  const credits: FeeCredit[] = creditRows.map((c) => ({ orderId: c.id, number: `#${c.number}`, fee: paise(Number(c.fee)), invoiceNumber: c.invoice }))
  const acc = account[0]
  const bill = computeBill({
    monthStart, nextMonthStart, prevMonthStart, plans: planHistory, addons, feeOrders, credits,
    carry: prev[0]?.carryOut ?? 0, rolledLastMonth: prev[0]?.rolled ?? false, prevPlanBilled: prev[0] ? Number(prev[0].planBilled) : null,
    // The place of supply: the GSTIN's state when there is one (finding 7), else the state typed.
    frrataGstin: frrataGstin(), shopState: gstinState(acc?.gstin ?? null) ?? acc?.stateCode ?? null,
  })

  const values = { taxable: bill.taxable, cgst: bill.cgst, sgst: bill.sgst, igst: bill.igst, total: bill.total, carryIn: prev[0]?.carryOut ?? 0, carryOut: bill.carryOut,
    rolled: bill.rolled, ordersBilled: bill.usage.orders, includedOrders: bill.usage.included, draftedAt: new Date() }
  const invoiceId = existing
    ? (await tx.update(frrataInvoices).set(values).where(and(eq(frrataInvoices.tenantId, tenantId), eq(frrataInvoices.id, existing.id), isNull(frrataInvoices.issuedAt))).returning({ id: frrataInvoices.id }))[0]!.id
    // Named columns: drizzle would write DEFAULT into number and issued_at, which frata_app holds no grant on (0048).
    : (await tx.execute<{ id: string }>(sql`insert into ${frrataInvoices} (tenant_id, period_start, period_end, drafted_at, taxable, cgst, sgst, igst, total, carry_in, carry_out, rolled, orders_billed, included_orders)
        values (${tenantId}, ${monthStart.toISOString()}::timestamptz, ${nextMonthStart.toISOString()}::timestamptz, ${values.draftedAt.toISOString()}::timestamptz, ${values.taxable}, ${values.cgst}, ${values.sgst}, ${values.igst}, ${values.total},
                ${values.carryIn}, ${values.carryOut}, ${values.rolled}, ${values.ordersBilled}, ${values.includedOrders}) returning id`))[0]!.id
  if (bill.lines.length) await tx.insert(frrataInvoiceLines).values(bill.lines.map((l, k) => ({ tenantId, invoiceId, position: k + 1, ...l })))
  if (bill.fees.length) await tx.insert(frrataInvoiceFees).values(bill.fees.map((f) => ({ tenantId, invoiceId, ...f })))
  if (bill.credited.length) await tx.insert(frrataFeeCredits).values(bill.credited.map((c) => ({ tenantId, invoiceId, ...c })))
  const numbers = new Map<string, number>([...feeRows.map((o) => [o.id, Number(o.number)] as const), ...creditRows.map((c) => [c.id, Number(c.number)] as const)])
  return { invoiceId, bill, numbers }
}

