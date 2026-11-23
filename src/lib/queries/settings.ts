import 'server-only'
import { mainHostFor } from './addresses'
import { and, eq, getTableColumns, gte } from 'drizzle-orm'
import { members, pincodes, planVersions, shopPolicies, shopSettings, tenantPlans, tenants } from '@/lib/db/schema'
import { notices } from '@/lib/db/schema-email'
import { istDayStart } from '@/domains/time/day'
import type { AskPage } from '@/domains/settings/owner-only'
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

/** Settings › Store: where the saved pickup PIN code is (India Post's directory), or null when unset or unknown. One
 *  statement, read beside the page's other reads (O1·5). */
export async function pickupPlace(tenantId: string): Promise<{ city: string; state: string } | null> {
  const [row] = await withTenant(tenantId, (tx) => tx.select({ city: pincodes.city, state: pincodes.state })
    .from(shopSettings).innerJoin(pincodes, eq(pincodes.pincode, shopSettings.pickupPincode))
    .where(eq(shopSettings.tenantId, tenantId)).limit(1))
  return row ?? null
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
 * Whether the store has an owner, inside the caller's tenant transaction, FAILING CLOSED (tenancy review 2026-11-08): with
 * no tenant context the policy hides every member row, so a count of zero (the caller is always a member) means "no
 * context", read as "has an owner". An error propagates. (No lock on members: `for share` needs an update grant frata_app
 * does not hold there; a content save in the same instant as a handover is accepted, V1 content plan § Reviews. A save
 * that must not race a handover asks `hasOwnerHeldIn`.)
 * The one read: costsVisibleIn, content saves (src/domains/content/who.ts), the owner-only settings (PP1) and the
 * Storefront API.
 */
export async function hasOwnerIn(tx: Tx, tenantId: string): Promise<boolean> {
  const rows = await tx.select({ role: members.role }).from(members).where(eq(members.tenantId, tenantId))
  return rows.length === 0 || rows.some((r) => r.role === 'owner')
}

/**
 * `hasOwnerIn`, after holding the store's own row FOR KEY SHARE (PP1's saves of owner-only settings): accepting a handover
 * (app_accept_handover_v2) holds that row FOR UPDATE before it adds the owner, so a save racing it either finishes first
 * or waits and then sees the owner. KEY SHARE, not SHARE, so a Store save renaming the store at the same moment
 * (FOR NO KEY UPDATE) never deadlocks with it (tenancy audit 2026-11-16 L1). frata_app's update grant on `tenants (name)` is what lets it take the share lock.
 */
export async function hasOwnerHeldIn(tx: Tx, tenantId: string): Promise<boolean> {
  await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for('key share')
  return hasOwnerIn(tx, tenantId)
}

/**
 * What a Settings page needs to draw the owner-only lock (PP1): whether the store has an owner (hasOwnerIn, failing
 * closed) and whether this page was already asked about this India day (app_ask_owner writes at most one a page a day,
 * whoever asks), in one transaction. Only a locked caller's page asks for the second.
 */
export async function ownerOnlyFacts(tenantId: string, page: AskPage | null, now: Date): Promise<{ hasOwner: boolean; askedToday: boolean }> {
  return withTenant(tenantId, async (tx) => {
    const [hasOwner, askedToday] = await Promise.all([hasOwnerIn(tx, tenantId), page ? askedTodayIn(tx, tenantId, page, now) : Promise.resolve(false)])
    return { hasOwner, askedToday }
  })
}

/** Whether the owner was asked about this page since the India day began: the notice app_ask_owner wrote (its fixed href). */
export async function askedTodayIn(tx: Tx, tenantId: string, page: AskPage, now: Date): Promise<boolean> {
  const rows = await tx.select({ id: notices.id }).from(notices)
    .where(and(eq(notices.tenantId, tenantId), eq(notices.sourceKind, 'ask_owner'), eq(notices.href, `/console/settings/${page}`), gte(notices.createdAt, istDayStart(now)))).limit(1)
  return rows.length > 0
}

/**
 * Whether this member sees the shop's costs and profit (`seesCosts`), inside the caller's tenant transaction. Owners,
 * admins and staff need no read. A partner's answer depends on whether the shop has an owner yet (hasOwnerIn, failing
 * closed: no ₹). An error propagates; the page then fails.
 */
export async function costsVisibleIn(tx: Tx, tenantId: string, role: MemberRole): Promise<boolean> {
  if (role !== 'partner') return seesCosts(role, true)
  return seesCosts(role, await hasOwnerIn(tx, tenantId))
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

/** What the shop said it sells (sign-up), for the new-product step: a shop of jewellery or beauty only is never asked for sizes. */
export async function shopSells(tenantId: string): Promise<string[]> {
  const [r] = await withTenant(tenantId, (tx) => tx.select({ sells: shopSettings.sells }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)))
  return r?.sells ?? []
}

/** A new shop's starting HSN, from what it sells (sign-up, plan 2026-11-09-gst-core-and-categories): a prefill for new products. */
export async function setStartingHsn(tenantId: string, hsn: string) {
  await withTenant(tenantId, (tx) => tx.update(shopSettings).set({ defaultHsn: hsn }).where(eq(shopSettings.tenantId, tenantId)))
}
