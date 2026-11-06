import 'server-only'
import { asc, desc, eq, inArray, lte, max } from 'drizzle-orm'
import { adminDb, type AdminTx } from '@/lib/db/admin'
import { plans, planVersions, tenantPlans } from '@/lib/db/schema'
import type { StaffOk } from '@/lib/auth/require-staff'
import type { Feature, PlanCode } from '@/domains/plans/entitlements'
import { auditStaff } from './audit'

// Plans and their versions. A version is never updated: a new price, fee or
// feature set is a new version (plan § A2). Merchants keep their version.

export type PlanWithVersions = {
  id: string
  code: PlanCode
  name: string
  versions: (typeof planVersions.$inferSelect)[]
}

export async function listPlans(staff: StaffOk): Promise<PlanWithVersions[]> {
  void staff
  const db = adminDb()
  const ps = await db.select().from(plans).orderBy(asc(plans.position))
  const vs = await db.select().from(planVersions).orderBy(desc(planVersions.version))
  return ps.map((p) => ({ id: p.id, code: p.code as PlanCode, name: p.name, versions: vs.filter((v) => v.planId === p.id) }))
}

/** The version new merchants get: the highest one. */
export async function latestVersion(tx: AdminTx, code: PlanCode) {
  const [row] = await tx.select({ v: planVersions }).from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(eq(plans.code, code)).orderBy(desc(planVersions.version)).limit(1)
  if (!row) throw new Error(`[plans] no version for ${code}`)
  return row.v
}

export async function newPlanVersion(
  staff: StaffOk,
  code: PlanCode,
  v: { monthlyPrice: number; includedOrders: number; feeBps: number; features: Feature[] },
) {
  return adminDb().transaction(async (tx) => {
    const [plan] = await tx.select().from(plans).where(eq(plans.code, code)).limit(1)
    if (!plan) throw new Error(`[plans] unknown plan ${code}`)
    const [{ top } = { top: 0 }] = await tx.select({ top: max(planVersions.version) }).from(planVersions).where(eq(planVersions.planId, plan.id))
    const [created] = await tx.insert(planVersions).values({
      planId: plan.id, version: (top ?? 0) + 1, monthlyPrice: v.monthlyPrice, includedOrders: v.includedOrders,
      feeBps: v.feeBps, features: v.features, createdBy: staff.userId,
    }).returning()
    await auditStaff(tx, staff, { action: 'plan.version.create', target: `${code} v${created!.version}`, detail: v })
    return created!
  })
}

/** A store's plan history, newest first, with each version's plan. */
export async function tenantPlanHistory(tx: AdminTx | ReturnType<typeof adminDb>, tenantIds: string[]) {
  if (tenantIds.length === 0) return []
  return tx.select({ tp: tenantPlans, v: planVersions, code: plans.code, name: plans.name })
    .from(tenantPlans)
    .innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId))
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(inArray(tenantPlans.tenantId, tenantIds))
    .orderBy(desc(tenantPlans.startsAt))
}

export async function changeTenantPlan(
  staff: StaffOk,
  tenantId: string,
  c: { code: PlanCode; startsAt: Date; trialEndsAt: Date | null; customMonthlyPrice: number | null; reason: string | null },
) {
  return adminDb().transaction(async (tx) => {
    const version = await latestVersion(tx, c.code)
    await tx.insert(tenantPlans).values({
      tenantId, planVersionId: version.id, startsAt: c.startsAt, trialEndsAt: c.trialEndsAt,
      customMonthlyPrice: c.customMonthlyPrice, reason: c.reason, createdBy: staff.userId,
    })
    await auditStaff(tx, staff, {
      tenantId, action: 'plan.change', target: `${c.code} v${version.version}`,
      detail: { startsAt: c.startsAt.toISOString(), trialEndsAt: c.trialEndsAt?.toISOString() ?? null, customMonthlyPrice: c.customMonthlyPrice, reason: c.reason },
    })
  })
}

/** How many stores are on each plan version right now. */
export async function storesPerVersion(staff: StaffOk, now: Date): Promise<Map<string, number>> {
  void staff
  const rows = await adminDb().select({ tenantId: tenantPlans.tenantId, versionId: tenantPlans.planVersionId, startsAt: tenantPlans.startsAt })
    .from(tenantPlans).where(lte(tenantPlans.startsAt, now)).orderBy(desc(tenantPlans.startsAt))
  const seen = new Set<string>(); const counts = new Map<string, number>()
  for (const r of rows) {
    if (seen.has(r.tenantId)) continue
    seen.add(r.tenantId); counts.set(r.versionId, (counts.get(r.versionId) ?? 0) + 1)
  }
  return counts
}

