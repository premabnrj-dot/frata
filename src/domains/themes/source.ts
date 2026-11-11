import { CATALOGUE } from './catalogue'
import { cmpSemver } from './semver'
import type { ThemeManifest } from './types'

// =============================================================================
// FILE: src/domains/themes/source.ts — where theme manifests come from (Theme Studio TS0a, ADR-0011). Every reader
// takes a ManifestSource instead of reaching the code catalogue, so a theme authored as data (TS2) joins without
// another caller changing. `codeSource` is the code catalogue; `src/lib/themes/manifests.ts` hands each request the
// source for its shop (today: the code catalogue). Pure. Only this file reads CATALOGUE for shops (check:layers).
// =============================================================================

export type ManifestSource = {
  /** Every theme key this source knows. */
  keys(): string[]
  /** Every version of a theme this source knows, any order. */
  versions(key: string): ThemeManifest[]
}

export const codeSource: ManifestSource = {
  keys: () => Object.keys(CATALOGUE),
  versions: (key) => Object.values(CATALOGUE[key] ?? {}),
}

/** The exact version, or null. */
export function manifestOf(src: ManifestSource, key: string, version: string): ThemeManifest | null {
  return src.versions(key).find((m) => m.version === version) ?? null
}

/**
 * The version a stored revision renders with: its own, else the newest of the same theme at or below it (a build
 * without that version, e.g. after a revert), else the theme's oldest. Never another theme (T2 review).
 */
export function manifestNear(src: ManifestSource, key: string, version: string): ThemeManifest | null {
  const vs = src.versions(key).sort((a, b) => cmpSemver(b.version, a.version))
  if (!vs.length) return null
  return vs.find((m) => m.version === version) ?? vs.find((m) => cmpSemver(m.version, version) <= 0) ?? vs.at(-1) ?? null
}
