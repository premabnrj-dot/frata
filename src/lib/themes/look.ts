import 'server-only'
import { and, desc, eq, inArray, notExists, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { shopThemePublishes, shopThemeRevisions, themeVersionStages, themeVersions } from '@/lib/db/schema-themes'
import { availableTo, liveOf, withdrawnKeys, type VersionRow } from '@/domains/themes/release'

// =============================================================================
// FILE: src/lib/themes/look.ts — the one module that reads or writes a shop's looks (themes plan § Review findings).
//   - LIVE  = the latest publish row (by published_at, then id). Derived; never stored.
//   - DRAFT = the newest revision that was never published. At most one: Try, Restore and the first edit replace it
//             under a per-shop lock, so an older unpublished revision can't exist. Undo after publish (a new publish
//             row for an older revision) leaves the draft as it was.
//   - A save and a publish both lock the revision row and check its `version`: two editors, or a save racing a
//     publish, can't change a live look or publish something other than what the dialog listed.
// Callers pass the shop's own transaction (asMember); every query also names the tenant.
// =============================================================================

export type Revision = typeof shopThemeRevisions.$inferSelect
export const SYSTEM = '00000000-0000-0000-0000-000000000000'
type Who = { userId: string; email: string | null }

const lockShop = (tx: Tx, tenantId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`look:${tenantId}`}))`)

/** Published looks, newest first: THE order that makes one live (by published_at, then id). The shop reads it too. */
async function published(tx: Tx, tenantId: string, limit: number) {
  const rows = await tx.select({ p: shopThemePublishes, r: shopThemeRevisions }).from(shopThemePublishes)
    .innerJoin(shopThemeRevisions, and(eq(shopThemeRevisions.tenantId, shopThemePublishes.tenantId), eq(shopThemeRevisions.id, shopThemePublishes.revisionId)))
    .where(eq(shopThemePublishes.tenantId, tenantId)).orderBy(desc(shopThemePublishes.publishedAt), desc(shopThemePublishes.id)).limit(limit)
  return rows.map((x) => ({ publishId: x.p.id, revision: x.r, publishedAt: x.p.publishedAt, publishedBy: x.p.publishedBy, publishedByEmail: x.p.publishedByEmail }))
}

/**
 * What liveOf chooses from (themes T3): the newest publish of each version this shop ever published, newest first.
 * Bounded by the number of versions, not by publishes, so a shop that published one version many times still falls
 * back to the version before when it's withdrawn (T3 impact review). The shop, Look and Undo all read this.
 */
export async function liveCandidates(tx: Tx, tenantId: string) {
  const all = await tx.select({ id: shopThemePublishes.id, revisionId: shopThemePublishes.revisionId, key: shopThemeRevisions.themeKey, version: shopThemeRevisions.themeVersion }).from(shopThemePublishes)
    .innerJoin(shopThemeRevisions, and(eq(shopThemeRevisions.tenantId, shopThemePublishes.tenantId), eq(shopThemeRevisions.id, shopThemePublishes.revisionId)))
    .where(eq(shopThemePublishes.tenantId, tenantId)).orderBy(desc(shopThemePublishes.publishedAt), desc(shopThemePublishes.id))
  const seen = new Set<string>()
  const pick = all.filter((p) => { const k = `${p.key}@${p.version}`; if (seen.has(k)) return false; seen.add(k); return true })
  if (!pick.length) return []
  const rows = await tx.select({ p: shopThemePublishes, r: shopThemeRevisions }).from(shopThemePublishes)
    .innerJoin(shopThemeRevisions, and(eq(shopThemeRevisions.tenantId, shopThemePublishes.tenantId), eq(shopThemeRevisions.id, shopThemePublishes.revisionId)))
    .where(and(eq(shopThemePublishes.tenantId, tenantId), inArray(shopThemePublishes.id, pick.map((p) => p.id))))
  const by = new Map(rows.map((x) => [x.p.id, x]))
  return pick.flatMap((p) => { const x = by.get(p.id); return x ? [{ publishId: x.p.id, revision: x.r, publishedAt: x.p.publishedAt, publishedBy: x.p.publishedBy, publishedByEmail: x.p.publishedByEmail, themeKey: x.r.themeKey, themeVersion: x.r.themeVersion }] : [] })
}

/**
 * Which theme versions this shop may use (themes T3): the platform's decisions and this shop's stages. THE loader
 * Try, the gallery, Customize, Restore, Publish and Undo ask (with availableTo / latestAvailable / liveOf).
 */
export async function themeAccess(tx: Tx, tenantId: string): Promise<{ rows: VersionRow[]; staged: Set<string>; bad: Set<string>; may: (key: string, version: string) => boolean }> {
  const [rows, st] = await Promise.all([
    tx.select({ id: themeVersions.id, themeKey: themeVersions.themeKey, version: themeVersions.version, releasedAt: themeVersions.releasedAt, recalledAt: themeVersions.recalledAt, withdrawnAt: themeVersions.withdrawnAt }).from(themeVersions),
    tx.select({ versionId: themeVersionStages.versionId }).from(themeVersionStages).where(eq(themeVersionStages.tenantId, tenantId)),
  ])
  const staged = new Set(st.map((s) => s.versionId))
  const may = (key: string, version: string) => { const r = rows.find((x) => x.themeKey === key && x.version === version) ?? null; return availableTo(r, !!r && staged.has(r.id)) }
  return { rows, staged, bad: withdrawnKeys(rows), may }
}

/** The live look's revision (liveOf: the newest publish not on a withdrawn version), or null: never published. */
export async function liveRevision(tx: Tx, tenantId: string): Promise<Revision | null> {
  const { bad } = await themeAccess(tx, tenantId)
  return liveOf(await liveCandidates(tx, tenantId), bad)?.revision ?? null
}

async function openDraft(tx: Tx, tenantId: string): Promise<Revision | null> {
  const [r] = await tx.select().from(shopThemeRevisions).where(and(
    eq(shopThemeRevisions.tenantId, tenantId),
    notExists(tx.select({ x: sql`1` }).from(shopThemePublishes).where(and(eq(shopThemePublishes.tenantId, tenantId), eq(shopThemePublishes.revisionId, shopThemeRevisions.id)))),
  )).orderBy(desc(shopThemeRevisions.createdAt)).limit(1)
  return r ?? null
}

type Published = { publishId: string; revision: Revision; publishedAt: Date; publishedBy: string; publishedByEmail: string | null }
export type Look = {
  live: Published | null; draft: Revision | null; history: Published[]
  /** Undo's target: the newest earlier look the shop may still use (not the live one, not recalled or withdrawn). */
  previous: Revision | null
  /** May the shop use this version (themeAccess)? */
  may: (key: string, version: string) => boolean
  access: Awaited<ReturnType<typeof themeAccess>>
}

/** Live, draft and history for the console (no other shop's rows can appear: the tenant is in every query). */
export async function lookFor(tx: Tx, tenantId: string): Promise<Look> {
  const [history, access, candidates] = await Promise.all([published(tx, tenantId, 50), themeAccess(tx, tenantId), liveCandidates(tx, tenantId)])
  const live = liveOf(candidates, access.bad)
  const previous = history.find((h) => h.revision.id !== live?.revision.id && access.may(h.revision.themeKey, h.revision.themeVersion))?.revision ?? null
  return { live: live ? { publishId: live.publishId, revision: live.revision, publishedAt: live.publishedAt, publishedBy: live.publishedBy, publishedByEmail: live.publishedByEmail } : null, draft: await openDraft(tx, tenantId), history, previous, may: access.may, access }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A revision of this shop, or null (another shop's id reads the same as a missing one). */
export async function revisionOf(tx: Tx, tenantId: string, id: string): Promise<Revision | null> {
  if (!UUID.test(id)) return null
  const [r] = await tx.select().from(shopThemeRevisions).where(and(eq(shopThemeRevisions.tenantId, tenantId), eq(shopThemeRevisions.id, id))).limit(1)
  return r ?? null
}

/**
 * A new draft (Try a theme, Restore): replaces the open draft, if any. With `reuse` (Customize), an open draft is kept
 * and returned instead: read under the lock, so two tabs opening Customize at once share one draft.
 */
export async function newDraft(tx: Tx, tenantId: string, who: Who, d: { themeKey: string; themeVersion: string; styleKey: string; settings: object }, opts: { reuse?: boolean } = {}): Promise<Revision> {
  await lockShop(tx, tenantId)
  const old = await openDraft(tx, tenantId)
  if (old && opts.reuse) return old
  if (old) await tx.delete(shopThemeRevisions).where(and(eq(shopThemeRevisions.tenantId, tenantId), eq(shopThemeRevisions.id, old.id)))
  const [r] = await tx.insert(shopThemeRevisions).values({
    tenantId, ...d, createdBy: who.userId, createdByEmail: who.email, updatedBy: who.userId, updatedByEmail: who.email,
  }).returning()
  return r!
}

export type SaveResult = { ok: true; version: number } | { ok: false; why: 'gone' | 'stale' | 'published' }

/** Autosave: only the open draft, only from the version the editor holds. */
export async function saveDraft(tx: Tx, tenantId: string, who: Who, d: { revisionId: string; version: number; styleKey: string; settings: object }): Promise<SaveResult> {
  const [r] = await tx.select().from(shopThemeRevisions).where(and(eq(shopThemeRevisions.tenantId, tenantId), eq(shopThemeRevisions.id, d.revisionId))).for('update')
  if (!r) return { ok: false, why: 'gone' }
  const [pub] = await tx.select({ id: shopThemePublishes.id }).from(shopThemePublishes).where(and(eq(shopThemePublishes.tenantId, tenantId), eq(shopThemePublishes.revisionId, r.id))).limit(1)
  if (pub) return { ok: false, why: 'published' }
  if (r.version !== d.version) return { ok: false, why: 'stale' }
  await tx.update(shopThemeRevisions).set({ settings: d.settings, styleKey: d.styleKey, version: r.version + 1, updatedAt: new Date(), updatedBy: who.userId, updatedByEmail: who.email })
    .where(and(eq(shopThemeRevisions.tenantId, tenantId), eq(shopThemeRevisions.id, r.id)))
  return { ok: true, version: r.version + 1 }
}

/** Publish the draft the editor saw (its `version`). A shop with no publish row first records the look it has today. */
export async function publishRevision(tx: Tx, tenantId: string, who: Who, d: { revisionId: string; version: number; baseline: () => { themeKey: string; themeVersion: string; styleKey: string; settings: object } }): Promise<'ok' | 'gone' | 'stale' | 'unavailable'> {
  await lockShop(tx, tenantId)
  const [r] = await tx.select().from(shopThemeRevisions).where(and(eq(shopThemeRevisions.tenantId, tenantId), eq(shopThemeRevisions.id, d.revisionId))).for('update')
  if (!r) return 'gone'
  if (r.version !== d.version) return 'stale'
  // A version recalled or withdrawn (or never offered to this shop) can't go live (T3). A withdraw racing this needs
  // no lock: render skips a withdrawn version anyway (liveOf).
  if (!(await themeAccess(tx, tenantId)).may(r.themeKey, r.themeVersion)) return 'unavailable'
  // No publish row at all (not "nothing live": every version withdrawn still has rows, and History has the baseline).
  if (!(await published(tx, tenantId, 1)).length) {
    // Lazy baseline (plan § T1·1): the shop's look before its first publish, so History and Undo have it.
    const b = d.baseline()
    const [base] = await tx.insert(shopThemeRevisions).values({ tenantId, ...b, createdAt: new Date(Date.now() - 1000), createdBy: SYSTEM, updatedBy: SYSTEM }).returning()
    await tx.insert(shopThemePublishes).values({ tenantId, revisionId: base!.id, publishedAt: new Date(Date.now() - 1000), publishedBy: SYSTEM })
  }
  await tx.insert(shopThemePublishes).values({ tenantId, revisionId: r.id, publishedBy: who.userId, publishedByEmail: who.email })
  return 'ok'
}

/**
 * Undo after publish: the look before the live one goes live again (a new publish row; history keeps both). Only
 * from the live look the person saw (`expectLive`): another publish since then refuses ('moved'). A second Undo
 * brings the undone look back (the previous look is the newest one that isn't live): that is intended.
 */
export async function undoPublish(tx: Tx, tenantId: string, who: Who, expectLive: string): Promise<Revision | 'none' | 'moved'> {
  await lockShop(tx, tenantId)
  const l = await lookFor(tx, tenantId)
  if (l.live?.revision.id !== expectLive) return 'moved'
  if (!l.previous) return 'none'
  await tx.insert(shopThemePublishes).values({ tenantId, revisionId: l.previous.id, publishedBy: who.userId, publishedByEmail: who.email })
  return l.previous
}

/** Discard: delete the open draft (the only delete; a published look is frozen by its trigger). */
export async function discardDraft(tx: Tx, tenantId: string): Promise<boolean> {
  await lockShop(tx, tenantId)
  const d = await openDraft(tx, tenantId)
  if (!d) return false
  await tx.delete(shopThemeRevisions).where(and(eq(shopThemeRevisions.tenantId, tenantId), eq(shopThemeRevisions.id, d.id)))
  return true
}
