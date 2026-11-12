import 'server-only'
import { mainHostFor } from './addresses'
import { eq, getTableColumns, sql } from 'drizzle-orm'
import { members, planVersions, shopPolicies, shopSettings, tenantPlans, tenants } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import type { ShipCosts } from '@/domains/settings/ship-costs'
import { seesCosts, type MemberRole } from '@/domains/tenancy/roles'
import { paise } from '@/domains/money/paise'
import { hsnDigitsFor, type TurnoverBand } from '@/domains/tax/rates'
import { BUILT_PAGES, readyToOpen, setupSteps, type SetupStep } from '@/domains/setup/checklist'
import { formatInr } from '@/lib/format'
import { activeProductCount, paymentStatusFor } from './payments'

// The settings row WITHOUT the shop's shipping-cost estimates: a merchant's cost, read only through shipCostsIn by
// owners and admins (ADR-0003; tenancy audit 2026-11-08: partners reach pages that read this row).
const { shipCostDelivery: _d, shipCostReturn: _r, shipCostCod: _c, shipCostsConfirmedAt: _a, ...settingsColumns } = getTableColumns(shopSettings)

/** A shop's name, address slug and settings row (costs left out), in one round trip. Null only if the row is missing. */
export async function shopWithSettings(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select({ name: tenants.name, slug: tenants.slug, settings: settingsColumns })
      .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId)).limit(1)
    return row ?? null
  })
}

/** Policy pages the merchant rewrote by hand, by kind. */
export async function policyOverrides(tenantId: string): Promise<Record<string, string>> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({ kind: shopPolicies.kind, body: shopPolicies.body }).from(shopPolicies).where(eq(shopPolicies.tenantId, tenantId)),
  )
  return Object.fromEntries(rows.map((r) => [r.kind, r.body]))
}


export type Setup = { name: string; address: string; open: boolean; steps: SetupStep[]; done: number; ready: boolean; left: SetupStep[] }

/**
 * The setup checklist as Home (before the shop opens) and /console/setup read it, once (U·4 review: one read, not
 * two copies of its inputs). Null when the shop's row is missing; throws when the read fails.
 */
export async function setupFor(tenantId: string): Promise<Setup | null> {
  const [shop, products, pay] = await Promise.all([shopWithSettings(tenantId), activeProductCount(tenantId), paymentStatusFor(tenantId)])
  if (!shop) return null
  const address = await mainHostFor(tenantId, shop.slug)
  const steps = setupSteps({
    shopName: shop.name, address, productCount: products,
    legalName: shop.settings.legalName, grievanceName: shop.settings.grievanceName, grievanceEmail: shop.settings.grievanceEmail, grievancePhone: shop.settings.grievancePhone,
    codOn: shop.settings.codOn, codMaxPaise: shop.settings.codMax, paymentsConnected: !!pay?.connected && pay.mode === 'live' && !!pay.webhookSeenAt, publishedAt: shop.settings.publishedAt,
  }, BUILT_PAGES, (p) => formatInr(paise(p)))
  return {
    name: shop.name, address, open: !!shop.settings.publishedAt, steps, done: steps.filter((s) => s.done).length, ready: readyToOpen(steps),
    left: steps.filter((s) => !s.done && s.key !== 'publish'),
  }
}


/** The costs and whether this member may see them (`seesCosts`, failing closed), in one transaction. */
export async function shipCostsSeenBy(tenantId: string, role: MemberRole): Promise<{ visible: boolean; costs: ShipCosts | null }> {
  return withTenant(tenantId, async (tx) => {
    const [visible, costs] = await Promise.all([costsVisibleIn(tx, tenantId, role), shipCostsIn(tx, tenantId)])
    return { visible, costs: visible ? costs : null }
  })
}

/** The one read of the three costs, inside the caller's tenant transaction (offerStats reads it too). */
export async function shipCostsIn(tx: Tx, tenantId: string): Promise<ShipCosts | null> {
  const [r] = await tx.select({ delivery: shopSettings.shipCostDelivery, ret: shopSettings.shipCostReturn, cod: shopSettings.shipCostCod, confirmedAt: shopSettings.shipCostsConfirmedAt })
    .from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).limit(1)
  const n = (v: number | bigint | string | null) => (v === null ? null : Number(v))
  return r ? { delivery: n(r.delivery), ret: n(r.ret), cod: n(r.cod), confirmedAt: r.confirmedAt } : null
}

/**
 * Whether this member sees the shop's costs and profit (`seesCosts`), inside the caller's tenant transaction. Owners,
 * admins and staff need no read. A partner's answer depends on whether the shop has an owner yet, and it FAILS CLOSED
 * (tenancy review 2026-11-08): with no tenant context the policy hides every member row, so a count of zero (a partner
 * is always a member) means "no context", read as "has an owner": no ₹. An error propagates; the page then fails.
 */
export async function costsVisibleIn(tx: Tx, tenantId: string, role: MemberRole): Promise<boolean> {
  if (role !== 'partner') return seesCosts(role, true)
  const [r] = await tx.select({ all: sql<number>`count(*)::int`, owners: sql<number>`(count(*) filter (where ${members.role} = 'owner'))::int` })
    .from(members).where(eq(members.tenantId, tenantId))
  if (!r || r.all === 0) return false
  return seesCosts(role, r.owners > 0)
}

/** The HSN digits the shop's invoices need for its turnover (rates.ts hsnDigitsFor), inside the caller's transaction:
 *  the one read behind the editor's save, Products › HSN codes and the import. */
export async function hsnDigitsIn(tx: Tx, tenantId: string): Promise<number> {
  const [s] = await tx.select({ band: shopSettings.turnoverBand }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
  return hsnDigitsFor((s?.band ?? 'under_5cr') as TurnoverBand)
}

/** The shop's plan versions with their fee, oldest first (feeForOrder's history; billing B0 replaces the pick). */
export async function planHistoryIn(tx: Tx, tenantId: string): Promise<{ startsAt: Date; feeBps: number }[]> {
  return tx.select({ startsAt: tenantPlans.startsAt, feeBps: planVersions.feeBps }).from(tenantPlans).innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId))
    .where(eq(tenantPlans.tenantId, tenantId)).orderBy(tenantPlans.startsAt)
}

/** A new shop's starting HSN, from what it sells (sign-up, plan 2026-11-09-gst-core-and-categories): a prefill for new products. */
export async function setStartingHsn(tenantId: string, hsn: string) {
  await withTenant(tenantId, (tx) => tx.update(shopSettings).set({ defaultHsn: hsn }).where(eq(shopSettings.tenantId, tenantId)))
}
