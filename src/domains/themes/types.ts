// =============================================================================
// FILE: src/domains/themes/types.ts — what a theme IS (docs/specs/2026-11-08-themes.md § The model).
// A theme is data over one section library Frrata owns: a manifest (code, immutable once released), a style
// (a preset inside it) and the merchant's layer (validated content). resolveTheme() merges them; rendering reads
// only ResolvedTheme. No CSS, no HTML, no script ever comes from a layer.
// =============================================================================

import type { SectionInstance, SectionKey } from './sections'

export type Hex = `#${string}`
/** The colour roles a section can be painted in. Shown to merchants by the style's own names. */
export type SchemeKey = 'paper' | 'tint' | 'ink'
export type Scheme = {
  bg: Hex; text: Hex; sub: Hex; line: Hex; chip: Hex
  accent: Hex; onAccent: Hex
  /** Buttons stay ink in Classic (settings/sections.ts: "Buttons stay ink"). */
  button: Hex; onButton: Hex
  good: Hex; bad: Hex; sale: Hex
}
export type Style = { key: string; name: string; schemes: Partial<Record<SchemeKey, Scheme>> & { paper: Scheme } }

/** Curated display faces; body is always Inter. Bricolage is Frrata's own face and never ships to a shop (brand rule 35). */
export const PAIRINGS = ['fraunces', 'cormorant', 'inter'] as const
export type Pairing = (typeof PAIRINGS)[number]

export const HEADERS = ['classic'] as const
export type HeaderVariant = (typeof HEADERS)[number]
export const FOOTERS = ['three'] as const
export type FooterVariant = (typeof FOOTERS)[number]

export type ThemeSettings = { pairing: Pairing; header: HeaderVariant; footer: FooterVariant }

export type ThemeManifest = {
  key: string
  /** semver */
  version: string
  name: string
  job: string
  features: string[]
  styles: Style[]
  defaults: ThemeSettings
  allowed: { pairings: Pairing[]; headers: HeaderVariant[]; footers: FooterVariant[]; sections: SectionKey[] }
  home: SectionInstance[]
}

/** The merchant's layer. Content, never state (which revision is live is a publish row). */
export type ThemeLayer = { style: string; settings?: Partial<ThemeSettings>; home?: SectionInstance[] }

export type ResolvedTheme = {
  key: string; version: string; style: string
  schemes: Record<SchemeKey, Scheme>
  settings: ThemeSettings
  home: SectionInstance[]
}
