import 'server-only'
import { eq, inArray, sql } from 'drizzle-orm'
import { trialState, trialEndsAt, daysUntil, lastDay, type TrialFacts, type TrialState } from '@/domains/plans/trial'
import { adminDb } from '@/lib/db/admin'
import { billingAccounts } from '@/lib/db/schema-billing'
import { shopTrials, trialSettings } from '@/lib/db/schema-trials'
import { tenants } from '@/lib/db/schema'
import type { StaffOk } from '@/lib/auth/require-staff'

// =============================================================================
// FILE: src/lib/admin/trials.ts — ADMIN'S SIDE OF FREE TRIALS (trials TR0·4; plan docs/plans/2026-11-08-trials.md).
// Reads: the platform terms, and each shop's trial with its derived state (src/domains/plans/trial.ts; nothing stored).
// Writes: ONLY through the definers in drizzle/0063, which check that the staff member is an admin, require a reason,
// write their own audit row, and recompute the one trial end (app_trial_recompute). Never a direct insert or update.
// =============================================================================

export type TrialTermsRow = { days: number; openWindowDays: number; reason: string | null; updatedAt: Date }

export async function trialTerms(staff: StaffOk): Promise<TrialTermsRow> {
  void staff
  const [r] = await adminDb().select({ days: trialSettings.days, openWindowDays: trialSettings.openWindowDays, reason: trialSettings.reason, updatedAt: trialSettings.updatedAt }).from(trialSettings).where(eq(trialSettings.id, 1))
  return r ?? { days: 30, openWindowDays: 15, reason: null, updatedAt: new Date(0) }
}

export type ShopTrialView = { facts: TrialFacts; state: TrialState; endsAt: Date; lastDay: Date; daysLeft: number }

/** Each listed shop's trial, derived; a shop without a trial row has none (never paused). */
export async function shopTrialsFor(staff: StaffOk, tenantIds: string[], now: Date): Promise<Map<string, ShopTrialView>> {
  void staff
  if (!tenantIds.length) return new Map()
  const db = adminDb()
  const [rows, accounts] = await Promise.all([
    db.select().from(shopTrials).where(inArray(shopTrials.tenantId, tenantIds)),
    db.select({ tenantId: billingAccounts.tenantId, mandateAt: billingAccounts.mandateAt, revokedAt: billingAccounts.mandateRevokedAt }).from(billingAccounts).where(inArray(billingAccounts.tenantId, tenantIds)),
  ])
  const mandate = new Map(accounts.map((a) => [a.tenantId, !!a.mandateAt && !a.revokedAt]))
  return new Map(rows.map((f) => {
    const endsAt = trialEndsAt(f)
    return [f.tenantId, { facts: f, state: trialState(now, f, { mandateActive: mandate.get(f.tenantId) ?? false, exposedAt: null }), endsAt, lastDay: lastDay(endsAt), daysLeft: daysUntil(now, endsAt) }]
  }))
}

const definer = async (q: ReturnType<typeof sql>) => { await adminDb().execute(q) }

export async function setTrialTerms(staff: StaffOk, t: { days: number; openWindowDays: number; reason: string }) {
  await definer(sql`select app_admin_set_trial_settings(${staff.userId}::uuid, ${t.days}, ${t.openWindowDays}, ${t.reason})`)
}
export async function setShopTrial(staff: StaffOk, tenantId: string, days: number, reason: string) {
  await definer(sql`select app_admin_set_shop_trial(${staff.userId}::uuid, ${tenantId}::uuid, ${days}, ${reason})`)
}
export async function extendShopTrial(staff: StaffOk, tenantId: string, reason: string) {
  await definer(sql`select app_admin_extend_trial(${staff.userId}::uuid, ${tenantId}::uuid, ${reason})`)
}
export async function endShopTrial(staff: StaffOk, tenantId: string, reason: string) {
  await definer(sql`select app_admin_end_trial(${staff.userId}::uuid, ${tenantId}::uuid, ${reason})`)
}

/** The definer's own words ("trial: …") are safe to show; anything else is generic. */
export function trialError(e: unknown): string {
  const m = /trial: (.{1,160})/.exec(e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : '')?.[1]
  return m ? `${m.charAt(0).toUpperCase()}${m.slice(1)}.` : 'Nothing was changed. Try again, or check the logs.'
}

export type TrialRow = ShopTrialView & { tenantId: string; name: string; autopay: boolean }

/** Admin › Trials: every shop with a trial, ending soonest first (paused and paid last). */
export async function trialList(staff: StaffOk, now: Date): Promise<TrialRow[]> {
  void staff
  const db = adminDb()
  const rows = await db.select({ tenantId: shopTrials.tenantId, name: tenants.name }).from(shopTrials).innerJoin(tenants, eq(tenants.id, shopTrials.tenantId))
  const views = await shopTrialsFor(staff, rows.map((r) => r.tenantId), now)
  const accounts = rows.length ? await db.select({ tenantId: billingAccounts.tenantId, mandateAt: billingAccounts.mandateAt, revokedAt: billingAccounts.mandateRevokedAt }).from(billingAccounts).where(inArray(billingAccounts.tenantId, rows.map((r) => r.tenantId))) : []
  const autopay = new Map(accounts.map((a) => [a.tenantId, !!a.mandateAt && !a.revokedAt]))
  const ORDER: Record<string, number> = { grace: 0, ending: 1, trial: 2, building: 3, paused: 4, paid: 5 }
  return rows.flatMap((r) => { const v = views.get(r.tenantId); return v ? [{ ...v, tenantId: r.tenantId, name: r.name, autopay: autopay.get(r.tenantId) ?? false }] : [] })
    .sort((a, b) => (ORDER[a.state]! - ORDER[b.state]!) || a.endsAt.getTime() - b.endsAt.getTime())
}
