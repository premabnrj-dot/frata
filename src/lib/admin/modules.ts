import 'server-only'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { modulePauses, tenantAddons, tenantModules } from '@/lib/db/schema-modules'
import type { StaffOk } from '@/lib/auth/require-staff'
import { currentPlan } from '@/domains/plans/entitlements'
import { addOnAllowed, liveAddon, moduleAccess, type ModuleAccess, type ModuleFacts } from '@/domains/modules/access'
import { isModuleKey, MODULES, PLAN_GRANTABLE, type ModuleKey } from '@/domains/modules/registry'
import { auditStaff } from './audit'
import { tenantPlanHistory } from './plans'

// =============================================================================
// FILE: src/lib/admin/modules.ts — Admin's view of a shop's modules, and the two
// things Frata staff change: a trial (or ending an add-on) and a platform pause.
// "Usable" is still moduleAccess(): Admin reads the same facts the shop reads,
// through frata_admin (ADR-0007), and derives nothing of its own.
// =============================================================================

export const TRIAL_DAYS = 30

export type MerchantModules = {
  access: Record<ModuleKey, ModuleAccess>
  planName: string | null
  planCode: string | null
  switchedOnAt: Partial<Record<ModuleKey, Date>>
  /** The add-on or trial in force per module (the one an "End" acts on). */
  addonId: Partial<Record<ModuleKey, string>>
}

export async function merchantModules(staff: StaffOk, tenantId: string, now: Date): Promise<MerchantModules> {
  void staff
  const db = adminDb()
  const [history, addons, switches, pauses] = await Promise.all([
    tenantPlanHistory(db, [tenantId]),
    db.select().from(tenantAddons).where(eq(tenantAddons.tenantId, tenantId)).orderBy(desc(tenantAddons.startsAt)),
    db.select().from(tenantModules).where(and(eq(tenantModules.tenantId, tenantId), isNull(tenantModules.disabledAt))),
    openPauses(),
  ])
  const plan = currentPlan(history.map((h) => ({ ...h, startsAt: h.tp.startsAt })), now)
  const facts: ModuleFacts = {
    planCode: plan?.code ?? null,
    planFeatures: plan?.v.features ?? [],
    addons: addons.filter((a) => isModuleKey(a.module)).map((a) => ({ id: a.id, module: a.module as ModuleKey, startsAt: a.startsAt, endsAt: a.endsAt, trialEndsAt: a.trialEndsAt })),
    switchedOn: switches.map((s) => s.module).filter(isModuleKey),
    paused: pauses.map((p) => p.module),
  }
  const access = moduleAccess(facts, now)
  const switchedOnAt: MerchantModules['switchedOnAt'] = {}
  for (const s of switches) if (isModuleKey(s.module)) switchedOnAt[s.module] = s.enabledAt
  const addonId: MerchantModules['addonId'] = {}
  for (const k of PLAN_GRANTABLE) { const a = liveAddon(facts.addons, k, now); if (a?.id) addonId[k] = a.id }
  return { access, planName: plan?.name ?? null, planCode: plan?.code ?? null, switchedOnAt, addonId }
}

/** A free trial of a module the shop's plan does not grant. Refuses a module not built yet (its days would
 *  run out unused) and one the shop already has; two clicks give one trial (a lock per shop and module). */
export async function giveTrial(staff: StaffOk, tenantId: string, module: ModuleKey, now: Date): Promise<'given' | 'has_it' | 'core' | 'next' | 'off_plan'> {
  if (!PLAN_GRANTABLE.includes(module)) return 'core'
  if (MODULES[module].status === 'next') return 'next'
  const ends = new Date(now.getTime() + TRIAL_DAYS * 86_400_000)
  return adminDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trial:${tenantId}:${module}`}))`)
    const m = await merchantModules(staff, tenantId, now)
    if (m.access[module].granted) return 'has_it' as const
    // Off-plan (Reviews on Launch): a trial row would grant nothing (addOnAllowed), so none is written.
    if (!addOnAllowed(module, m.planCode)) return 'off_plan' as const
    await tx.insert(tenantAddons).values({ tenantId, module, startsAt: now, trialEndsAt: ends, reason: `${TRIAL_DAYS}-day trial`, createdBy: staff.userId })
    await auditStaff(tx, staff, { tenantId, action: 'module.trial', target: module, detail: { trialEndsAt: ends.toISOString() } })
    return 'given' as const
  })
}

/** Ends a trial or add-on now. Only ends_at changes; the row stays as history. */
export async function endAddon(staff: StaffOk, tenantId: string, addonId: string, now: Date): Promise<boolean> {
  return adminDb().transaction(async (tx) => {
    const [row] = await tx.update(tenantAddons).set({ endsAt: now })
      .where(and(eq(tenantAddons.id, addonId), eq(tenantAddons.tenantId, tenantId), isNull(tenantAddons.endsAt)))
      .returning({ module: tenantAddons.module })
    if (!row) return false
    await auditStaff(tx, staff, { tenantId, action: 'module.end', target: row.module })
    return true
  })
}

export async function openPauses(): Promise<{ module: ModuleKey; pausedAt: Date; reason: string }[]> {
  const rows = await adminDb().select().from(modulePauses).where(isNull(modulePauses.resumedAt))
  return rows.filter((r) => isModuleKey(r.module)).map((r) => ({ module: r.module as ModuleKey, pausedAt: r.pausedAt, reason: r.reason }))
}

/** Holds a module back for every shop. Messages wait in the outbox; nothing is dropped (outboxDecision). */
export async function pauseModule(staff: StaffOk, module: ModuleKey, reason: string): Promise<boolean> {
  return adminDb().transaction(async (tx) => {
    const [row] = await tx.insert(modulePauses).values({ module, pausedBy: staff.userId, reason }).onConflictDoNothing().returning({ id: modulePauses.id })
    if (!row) return false
    await auditStaff(tx, staff, { action: 'module.pause', target: module, detail: { reason } })
    return true
  })
}

export async function resumeModule(staff: StaffOk, module: ModuleKey, now: Date): Promise<boolean> {
  return adminDb().transaction(async (tx) => {
    const [row] = await tx.update(modulePauses).set({ resumedAt: now, resumedBy: staff.userId })
      .where(and(eq(modulePauses.module, module), isNull(modulePauses.resumedAt))).returning({ id: modulePauses.id })
    if (!row) return false
    await auditStaff(tx, staff, { action: 'module.resume', target: module })
    return true
  })
}

export const moduleName = (k: ModuleKey) => MODULES[k].name

export type InterestRow = { module: ModuleKey; tenantId: string; shop: string; people: number; firstAt: Date }

/** "Tell me when it's ready", per app: which shops asked and how many people (Apps gallery A1), through the staff-only
 *  definer (drizzle/0104). Frrata sends those shops a Notice when the app ships. */
export async function appInterest(staff: StaffOk): Promise<InterestRow[]> {
  const rows = await adminDb().execute<{ module: string; tenant_id: string; shop: string; people: string; first_at: string | Date }>(
    sql`select module, tenant_id, shop, people, first_at from app_admin_interest(${staff.userId}::uuid)`)
  return [...rows].filter((r) => isModuleKey(r.module)).map((r) => ({ module: r.module as ModuleKey, tenantId: r.tenant_id, shop: r.shop, people: Number(r.people), firstAt: new Date(r.first_at) }))
}
