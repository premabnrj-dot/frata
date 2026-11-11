import { cmpSemver } from './semver'
import type { ThemeManifest } from './types'

// =============================================================================
// FILE: src/domains/themes/release.ts — which theme versions a shop may use (themes T3). Pure.
// Code ships a version (a deploy); Admin decides who may use it. State is derived from the row's timestamps, never
// stored: deployed (in code, no row) · added · staged (to some shops) · released · recalled · withdrawn.
// THE one answer to "may this shop start a draft on this version": availableTo. Try, the update banner, the gallery
// and Publish all ask it.
// =============================================================================

export type VersionRow = {
  id: string; themeKey: string; version: string
  releasedAt: Date | null; recalledAt: Date | null; withdrawnAt: Date | null
}
export type VersionState = 'deployed' | 'added' | 'staged' | 'released' | 'recalled' | 'withdrawn'

export function versionState(row: VersionRow | null, stagedShops = 0): VersionState {
  if (!row) return 'deployed'
  if (row.withdrawnAt) return 'withdrawn'
  if (row.recalledAt) return 'recalled'
  if (row.releasedAt) return 'released'
  return stagedShops > 0 ? 'staged' : 'added'
}

/** May a shop start a draft on (or publish) this version: released, or staged to this shop; never recalled or withdrawn. */
export const availableTo = (row: VersionRow | null, stagedHere: boolean): boolean =>
  !!row && !row.withdrawnAt && !row.recalledAt && (!!row.releasedAt || stagedHere)

/** The newest version of a theme this shop may start on, from the versions in this build. */
export function latestAvailable<M extends Pick<ThemeManifest, 'key' | 'version'>>(key: string, inCode: M[], rows: VersionRow[], staged: Set<string>): M | null {
  const ok = inCode.filter((m) => m.key === key).filter((m) => { const r = rows.find((x) => x.themeKey === key && x.version === m.version) ?? null; return availableTo(r, !!r && staged.has(r.id)) })
  return ok.sort((a, b) => cmpSemver(b.version, a.version))[0] ?? null
}

/** Versions a live look must not render (withdrawn for a problem): the shop falls back to its previous publish. */
export const withdrawnKeys = (rows: VersionRow[]): Set<string> => new Set(rows.filter((r) => r.withdrawnAt).map((r) => `${r.themeKey}@${r.version}`))

/**
 * THE live rule (themes T3): a shop's live look is its newest publish whose version isn't withdrawn. `publishes`
 * newest first. Read by the shop, Look, Undo and Admin's counts, so none can disagree.
 */
export function liveOf<P extends { themeKey: string; themeVersion: string }>(publishes: P[], bad: Set<string>): P | null {
  return publishes.find((p) => !bad.has(`${p.themeKey}@${p.themeVersion}`)) ?? null
}

/**
 * The shop's live look from its cached entry (TS0a): the newest candidate not withdrawn (liveOf). Its body comes from the
 * entry when it is the newest candidate; otherwise the caller reads that revision by id.
 */
export function liveFromEntry<B extends { revisionId: string }>(entry: { candidates: { revisionId: string; themeKey: string; themeVersion: string }[]; first: B | null }, bad: Set<string>): { body: B } | { fetch: string } | null {
  const live = liveOf(entry.candidates, bad)
  if (!live) return null
  return entry.first && entry.first.revisionId === live.revisionId ? { body: entry.first } : { fetch: live.revisionId }
}

/** The look every shop can fall back to (baselineRevision): it can never be recalled or withdrawn. */
export const isBaseline = (key: string, version: string) => key === 'classic' && version === '1.0.0'

/**
 * Why a version can't be released (empty: it can). A version earlier than one already released can't be (shops
 * would move backwards), and the version must be in this build.
 */
export function releaseProblems(m: ThemeManifest | null, released: string[]): string[] {
  if (!m) return ['This version is not in the deployed code.']
  const newer = released.filter((v) => cmpSemver(v, m.version) > 0)
  return newer.length ? [`${m.name} ${newer.sort(cmpSemver).at(-1)} is already released; an earlier version can't follow it.`] : []
}
