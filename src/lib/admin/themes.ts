import 'server-only'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { tenants } from '@/lib/db/schema'
import { shopThemePublishes, shopThemeRevisions, themeVersionStages, themeVersions } from '@/lib/db/schema-themes'
import type { StaffOk } from '@/lib/auth/require-staff'
import { CATALOGUE } from '@/domains/themes/catalogue'
import { cmpSemver } from '@/domains/themes/semver'
import { codeSource, manifestOf as manifestIn } from '@/domains/themes/source'

import { isBaseline, liveOf, releaseProblems, versionState, withdrawnKeys, type VersionState } from '@/domains/themes/release'
import { auditStaff } from './audit'

// Admin decides about CODE versions (T3); studio versions arrive in TS2 with their own reads.
const manifestOf = (key: string, version: string) => manifestIn(codeSource, key, version)

// =============================================================================
// FILE: src/lib/admin/themes.ts — Admin › Themes (themes T3). Code ships a version; Admin decides who may use it:
// stage to pilot shops, release to everyone, recall (no new looks on it), withdraw (live shops fall back to their
// previous look at once). Decisions are final (a database trigger); the fix for a bad version is a new version.
// Through frata_admin (ADR-0007): shop looks are read by column (key, version, when), never their content.
// =============================================================================

export type AdminVersion = {
  key: string; version: string; name: string; features: string[]; inCode: boolean
  id: string | null; state: VersionState
  releasedAt: Date | null; recalledAt: Date | null; recalledReason: string | null; withdrawnAt: Date | null; withdrawnReason: string | null
  /** Shops whose live look (liveOf) is on this version: how many, and who (a withdraw names them). */
  live: number
  liveShops: { tenantId: string; name: string }[]
  staged: { tenantId: string; name: string }[]
}

/** Every version in this build or in the table, with its state and how many shops are live on it. */
export async function themeVersionsForAdmin(staff: StaffOk): Promise<AdminVersion[]> {
  void staff
  const db = adminDb()
  const [rows, stages, pubs, revs, names] = await Promise.all([
    db.select().from(themeVersions),
    db.select({ versionId: themeVersionStages.versionId, tenantId: themeVersionStages.tenantId, name: tenants.name }).from(themeVersionStages).innerJoin(tenants, eq(tenants.id, themeVersionStages.tenantId)).orderBy(asc(tenants.name)),
    db.select({ tenantId: shopThemePublishes.tenantId, revisionId: shopThemePublishes.revisionId, publishedAt: shopThemePublishes.publishedAt, id: shopThemePublishes.id }).from(shopThemePublishes),
    db.select({ id: shopThemeRevisions.id, tenantId: shopThemeRevisions.tenantId, themeKey: shopThemeRevisions.themeKey, themeVersion: shopThemeRevisions.themeVersion }).from(shopThemeRevisions),
    db.select({ id: tenants.id, name: tenants.name }).from(tenants),
  ])
  const nameOf = new Map(names.map((n) => [n.id, n.name]))
  // Each shop's live look by the shop's own rule (liveOf), so Admin's counts never disagree with what shoppers see.
  const bad = withdrawnKeys(rows)
  const rev = new Map(revs.map((r) => [r.id, r]))
  const byShop = new Map<string, { themeKey: string; themeVersion: string; at: number; id: string }[]>()
  for (const p of pubs) { const r = rev.get(p.revisionId); if (!r) continue; const list = byShop.get(p.tenantId) ?? []; list.push({ themeKey: r.themeKey, themeVersion: r.themeVersion, at: p.publishedAt.getTime(), id: p.id }); byShop.set(p.tenantId, list) }
  const live = new Map<string, { tenantId: string; name: string }[]>()
  for (const [tenantId, list] of byShop) {
    const l = liveOf(list.sort((a, b) => b.at - a.at || b.id.localeCompare(a.id)), bad)
    if (l) { const k = `${l.themeKey}@${l.themeVersion}`; live.set(k, [...(live.get(k) ?? []), { tenantId, name: nameOf.get(tenantId) ?? tenantId }]) }
  }
  const keys = new Set([...Object.values(CATALOGUE).flatMap((vs) => Object.values(vs).map((m) => `${m.key}@${m.version}`)), ...rows.map((r) => `${r.themeKey}@${r.version}`)])
  return [...keys].map((kv) => {
    const [key, version] = kv.split('@') as [string, string]
    const m = manifestOf(key, version)
    const r = rows.find((x) => x.themeKey === key && x.version === version) ?? null
    const staged = r ? stages.filter((s) => s.versionId === r.id).map((s) => ({ tenantId: s.tenantId, name: s.name })) : []
    return {
      key, version, name: m?.name ?? key, features: m?.features ?? [], inCode: !!m, id: r?.id ?? null, state: versionState(r, staged.length),
      releasedAt: r?.releasedAt ?? null, recalledAt: r?.recalledAt ?? null, recalledReason: r?.recalledReason ?? null, withdrawnAt: r?.withdrawnAt ?? null, withdrawnReason: r?.withdrawnReason ?? null,
      live: live.get(kv)?.length ?? 0, liveShops: (live.get(kv) ?? []).sort((a, b) => a.name.localeCompare(b.name)), staged,
    }
  }).sort((a, b) => a.key.localeCompare(b.key) || cmpSemver(b.version, a.version))
}

type Tx = Parameters<Parameters<ReturnType<typeof adminDb>['transaction']>[0]>[0]
/** The version's row, made on the first decision about it (there is no separate "Add": T3 review). */
async function rowFor(tx: Tx, key: string, version: string): Promise<{ id: string } | null> {
  if (!manifestOf(key, version)) return null
  await tx.insert(themeVersions).values({ themeKey: key, version }).onConflictDoNothing()
  const [r] = await tx.select({ id: themeVersions.id }).from(themeVersions).where(and(eq(themeVersions.themeKey, key), eq(themeVersions.version, version)))
  return r ?? null
}

/** Offer a version to one shop before everyone (a pilot). */
export async function stageVersion(staff: StaffOk, key: string, version: string, tenantId: string): Promise<'staged' | 'not_in_code' | 'pulled'> {
  return adminDb().transaction(async (tx) => {
    const r = await rowFor(tx, key, version)
    if (!r) return 'not_in_code' as const
    const [row] = await tx.select().from(themeVersions).where(eq(themeVersions.id, r.id))
    if (row?.recalledAt || row?.withdrawnAt) return 'pulled' as const
    const added = await tx.insert(themeVersionStages).values({ tenantId, versionId: r.id, stagedBy: staff.userId }).onConflictDoNothing().returning({ v: themeVersionStages.versionId })
    if (added.length) await auditStaff(tx, staff, { tenantId, action: 'theme.stage', target: `${key}@${version}` })
    return 'staged' as const
  })
}

export async function unstageVersion(staff: StaffOk, key: string, version: string, tenantId: string): Promise<boolean> {
  return adminDb().transaction(async (tx) => {
    const [r] = await tx.select({ id: themeVersions.id }).from(themeVersions).where(and(eq(themeVersions.themeKey, key), eq(themeVersions.version, version)))
    if (!r) return false
    const gone = await tx.delete(themeVersionStages).where(and(eq(themeVersionStages.versionId, r.id), eq(themeVersionStages.tenantId, tenantId))).returning({ v: themeVersionStages.versionId })
    if (!gone.length) return false
    await auditStaff(tx, staff, { tenantId, action: 'theme.unstage', target: `${key}@${version}` })
    return true
  })
}

/** Release to every shop. Refused for a version earlier than one already released, or one not in this build. */
export async function releaseVersion(staff: StaffOk, key: string, version: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return adminDb().transaction(async (tx) => {
    const r = await rowFor(tx, key, version)
    if (!r) return { ok: false as const, error: 'This version is not in the deployed code.' }
    const released = (await tx.select({ v: themeVersions.version }).from(themeVersions).where(and(eq(themeVersions.themeKey, key), sql`${themeVersions.releasedAt} is not null`))).map((x) => x.v)
    const why = releaseProblems(manifestOf(key, version), released.filter((v) => v !== version))
    if (why.length) return { ok: false as const, error: why[0]! }
    const done = await tx.update(themeVersions).set({ releasedAt: new Date(), releasedBy: staff.userId })
      .where(and(eq(themeVersions.id, r.id), isNull(themeVersions.releasedAt), isNull(themeVersions.recalledAt), isNull(themeVersions.withdrawnAt))).returning({ id: themeVersions.id })
    if (!done.length) return { ok: false as const, error: 'It is already released, or was recalled.' }
    await auditStaff(tx, staff, { action: 'theme.release', target: `${key}@${version}` })
    return { ok: true as const }
  })
}

/**
 * Recall: no new looks on this version (Try, updates and Publish refuse it); shops live on it keep showing it and
 * are offered their previous look. Withdraw: live shops on it show their previous look at once. Both final, both
 * need a reason; the baseline (Classic 1.0.0) can't be pulled.
 */
export async function pullVersion(staff: StaffOk, key: string, version: string, how: 'recall' | 'withdraw', reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isBaseline(key, version)) return { ok: false, error: 'Classic 1.0.0 is every shop’s fallback look; it can’t be pulled.' }
  if (reason.trim().length < 3) return { ok: false, error: 'Say why, in a few words.' }
  return adminDb().transaction(async (tx) => {
    const r = await rowFor(tx, key, version)
    if (!r) return { ok: false as const, error: 'This version is not in the deployed code.' }
    const now = new Date()
    const done = how === 'recall'
      ? await tx.update(themeVersions).set({ recalledAt: now, recalledBy: staff.userId, recalledReason: reason.trim() }).where(and(eq(themeVersions.id, r.id), isNull(themeVersions.recalledAt), isNull(themeVersions.withdrawnAt))).returning({ id: themeVersions.id })
      // A withdraw also recalls (a withdrawn version can't be started on either).
      : await tx.update(themeVersions).set({ withdrawnAt: now, withdrawnBy: staff.userId, withdrawnReason: reason.trim(), ...(await isRecalled(tx, r.id) ? {} : { recalledAt: now, recalledBy: staff.userId, recalledReason: reason.trim() }) }).where(and(eq(themeVersions.id, r.id), isNull(themeVersions.withdrawnAt))).returning({ id: themeVersions.id })
    if (!done.length) return { ok: false as const, error: how === 'recall' ? 'It is already recalled.' : 'It is already withdrawn.' }
    await auditStaff(tx, staff, { action: `theme.${how}`, target: `${key}@${version}`, detail: { reason: reason.trim() } })
    return { ok: true as const }
  })
}
const isRecalled = async (tx: Tx, id: string) => !!(await tx.select({ r: themeVersions.recalledAt }).from(themeVersions).where(eq(themeVersions.id, id)))[0]?.r

/** Shops to stage to: by name, the same search as Merchants. */
export async function shopsNamed(staff: StaffOk, q: string): Promise<{ id: string; name: string; slug: string }[]> {
  void staff
  if (q.trim().length < 2) return []
  return adminDb().select({ id: tenants.id, name: tenants.name, slug: tenants.slug }).from(tenants)
    .where(sql`(${tenants.name} ilike ${'%' + q.trim() + '%'} or ${tenants.slug} ilike ${'%' + q.trim() + '%'})`).orderBy(asc(tenants.name)).limit(10)
}
