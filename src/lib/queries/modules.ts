import 'server-only'
import { cache } from 'react'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { currentPlan } from '@/domains/plans/entitlements'
import { addonPrices, modulePauses, tenantAddons, tenantModules } from '@/lib/db/schema-modules'
import { planVersions, tenantPlans } from '@/lib/db/schema'
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
    const plans = await tx.select({ features: planVersions.features, startsAt: tenantPlans.startsAt }).from(tenantPlans)
      .innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId))
      .where(eq(tenantPlans.tenantId, tenantId))
    const plan = currentPlan(plans, now)
    const addons = await tx.select({ module: tenantAddons.module, startsAt: tenantAddons.startsAt, endsAt: tenantAddons.endsAt, trialEndsAt: tenantAddons.trialEndsAt })
      .from(tenantAddons).where(eq(tenantAddons.tenantId, tenantId))
    const switches = await tx.select({ module: tenantModules.module }).from(tenantModules)
      .where(and(eq(tenantModules.tenantId, tenantId), isNull(tenantModules.disabledAt)))
    const pauses = await tx.select({ module: modulePauses.module }).from(modulePauses).where(isNull(modulePauses.resumedAt))
    return {
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

/** The current price of each add-on (newest version), in paise. Platform rows; read inside the shop's transaction. */
export async function addonPriceList(tenantId: string): Promise<Partial<Record<ModuleKey, { id: string; monthlyPrice: number; version: number }>>> {
  const rows = await withTenant(tenantId, (tx) => tx.execute<{ id: string; module: string; monthly_price: string; version: number }>(sql`
    select distinct on (module) id, module, monthly_price, version from ${addonPrices} order by module, version desc`))
  const out: Partial<Record<ModuleKey, { id: string; monthlyPrice: number; version: number }>> = {}
  for (const r of rows) if (isModuleKey(r.module) && ADD_ONS.includes(r.module)) out[r.module] = { id: r.id, monthlyPrice: Number(r.monthly_price), version: r.version }
  return out
}
