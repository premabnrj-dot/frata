import 'server-only'
import { cache } from 'react'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import type { Membership } from '@/lib/db/platform'
import { featuredBillWith } from '@/lib/queries/billing'
import { currentPlan } from '@/domains/plans/entitlements'
import { addonPrices, appInterest, modulePauses, tenantAddons, tenantModules } from '@/lib/db/schema-modules'
import { plans as planRows, planVersions, tenantPlans } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'
import { moduleAccess, type ModuleAccess, type ModuleFacts } from '@/domains/modules/access'
import { ADD_ONS, isModuleKey, type ModuleKey } from '@/domains/modules/registry'

// =============================================================================
// FILE: src/lib/queries/modules.ts — a shop's module facts, read once per request.
// "Usable" is derived by moduleAccess() and nowhere else (spec § 2–3). Facts are
// read inside the shop's own transaction: the plan in force, its add-ons, its
// switches; pauses are platform rows every shop may read (catalogue_read).
// =============================================================================

export type ShopModules = { facts: ModuleFacts; access: Record<ModuleKey, ModuleAccess> }

/** The facts, read in a transaction already set to this shop (an action's own, or withTenant's). */
export async function readFactsIn(tx: Tx, tenantId: string, now: Date): Promise<ModuleFacts> {
  {
    const plans = await tx.select({ features: planVersions.features, code: planRows.code, startsAt: tenantPlans.startsAt }).from(tenantPlans)
      .innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId)).innerJoin(planRows, eq(planRows.id, planVersions.planId))
      .where(eq(tenantPlans.tenantId, tenantId))
    const plan = currentPlan(plans, now)
    const addons = await tx.select({ module: tenantAddons.module, startsAt: tenantAddons.startsAt, endsAt: tenantAddons.endsAt, trialEndsAt: tenantAddons.trialEndsAt, byShop: tenantAddons.byShop })
      .from(tenantAddons).where(eq(tenantAddons.tenantId, tenantId))
    const switches = await tx.select({ module: tenantModules.module }).from(tenantModules)
      .where(and(eq(tenantModules.tenantId, tenantId), isNull(tenantModules.disabledAt)))
    const pauses = await tx.select({ module: modulePauses.module }).from(modulePauses).where(isNull(modulePauses.resumedAt))
    return {
      planCode: plan?.code ?? null,
      planFeatures: plan?.features ?? [],
      addons: addons.filter((a) => isModuleKey(a.module)).map((a) => ({ ...a, module: a.module as ModuleKey })),
      switchedOn: switches.map((s) => s.module).filter(isModuleKey),
      paused: pauses.map((p) => p.module).filter(isModuleKey),
    }
  }
}

const readFacts = (tenantId: string, now: Date) => withTenant(tenantId, (tx) => readFactsIn(tx, tenantId, now))

/** Access inside an action's transaction: the check and the write see one snapshot, on one connection. */
export async function moduleAccessIn(tx: Tx, tenantId: string, now: Date) {
  return moduleAccess(await readFactsIn(tx, tenantId, now), now)
}

/** Facts and access for one shop. Cached per request for the same (tenant, at): pass one `at` down a render to share the read. */
export const shopModules = cache(async (tenantId: string, at: string): Promise<ShopModules> => {
  const now = new Date(at)
  const facts = await readFacts(tenantId, now)
  return { facts, access: moduleAccess(facts, now) }
})

type PriceList = Partial<Record<ModuleKey, { id: string; monthlyPrice: number; version: number }>>

/** The current price of each add-on (newest version), in paise. Platform rows; read inside the shop's transaction. */
async function pricesIn(tx: Tx): Promise<PriceList> {
  const rows = await tx.execute<{ id: string; module: string; monthly_price: string; version: number }>(sql`
    select distinct on (module) id, module, monthly_price, version from ${addonPrices} order by module, version desc`)
  const out: PriceList = {}
  for (const r of rows) if (isModuleKey(r.module) && ADD_ONS.includes(r.module)) out[r.module] = { id: r.id, monthlyPrice: Number(r.monthly_price), version: r.version }
  return out
}

/** Everything the Apps gallery and an app's page read, in ONE transaction (architecture review A5): the facts, the
 *  add-on prices and which coming-next apps this member asked about. `userId` is the session's. `bill`: the member,
 *  passed only by the gallery for owners and admins, for the featured card (A2; featuredBillWith refuses anyone else). */
export async function appsPage(tenantId: string, userId: string, at: string, bill?: Pick<Membership, 'tenantId' | 'role' | 'supportSessionId'>) {
  const now = new Date(at)
  return withTenant(tenantId, async (tx) => {
    const facts = await readFactsIn(tx, tenantId, now)
    const [prices, asked] = await Promise.all([
      pricesIn(tx),
      tx.select({ module: appInterest.module }).from(appInterest).where(and(eq(appInterest.tenantId, tenantId), eq(appInterest.userId, userId))),
    ])
    // The card fails closed, in its own savepoint after the page's reads, so its error can never abort the page's
    // transaction (security review A2 LOW-3); logged by name.
    const featured = bill
      ? await tx.transaction((sp) => featuredBillWith(sp, bill, now)).catch((err) => { console.error('[apps featured]', err instanceof Error ? err.name : 'error'); return null })
      : null
    return { facts, access: moduleAccess(facts, now), prices, asked: new Set(asked.map((r) => r.module).filter(isModuleKey)), featured }
  })
}
