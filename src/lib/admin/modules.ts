import 'server-only'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { modulePauses, tenantAddons, tenantModules } from '@/lib/db/schema-modules'
import type { StaffOk } from '@/lib/auth/require-staff'
import { currentPlan } from '@/domains/plans/entitlements'
import { moduleAccess, type ModuleAccess, type ModuleFacts } from '@/domains/modules/access'
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
    planFeatures: plan?.v.features ?? [],
    addons: addons.filter((a) => isModuleKey(a.module)).map((a) => ({ module: a.module as ModuleKey, startsAt: a.startsAt, endsAt: a.endsAt, trialEndsAt: a.trialEndsAt })),
    switchedOn: switches.map((s) => s.module).filter(isModuleKey),
    paused: pauses.map((p) => p.module),
  }
  const access = moduleAccess(facts, now)
  const switchedOnAt: MerchantModules['switchedOnAt'] = {}
  for (const s of switches) if (isModuleKey(s.module)) switchedOnAt[s.module] = s.enabledAt
  const addonId: MerchantModules['addonId'] = {}
  for (const a of addons) {
    if (!isModuleKey(a.module) || addonId[a.module]) continue
    const live = a.startsAt <= now && (!a.endsAt || a.endsAt > now) && (!a.trialEndsAt || a.trialEndsAt > now)
    if (live) addonId[a.module] = a.id
  }
  return { access, planName: plan?.name ?? null, switchedOnAt, addonId }
}

/** A free trial of a module the shop's plan does not grant. Refuses one it already has. */
export async function giveTrial(staff: StaffOk, tenantId: string, module: ModuleKey, now: Date): Promise<'given' | 'has_it' | 'core'> {
  if (!PLAN_GRANTABLE.includes(module)) return 'core'
  const m = await merchantModules(staff, tenantId, now)
  if (m.access[module].granted) return 'has_it'
  const ends = new Date(now.getTime() + TRIAL_DAYS * 86_400_000)
  await adminDb().transaction(async (tx) => {
    await tx.insert(tenantAddons).values({ tenantId, module, startsAt: now, trialEndsAt: ends, reason: `${TRIAL_DAYS}-day trial`, createdBy: staff.userId })
    await auditStaff(tx, staff, { tenantId, action: 'module.trial', target: module, detail: { trialEndsAt: ends.toISOString() } })
  })
  return 'given'
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
