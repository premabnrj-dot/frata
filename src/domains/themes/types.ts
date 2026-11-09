// =============================================================================
// FILE: src/domains/themes/types.ts — what a theme IS (docs/specs/2026-11-08-themes.md § The model).
// A theme is data over one section library Frrata owns: a manifest (code, immutable once released), a style
// (a preset inside it) and the merchant's layer (validated content). resolveTheme() merges them; rendering reads
// only ResolvedTheme. No CSS, no HTML, no script ever comes from a layer.
// =============================================================================

import type { SectionInput, SectionInstance, SectionKey } from './sections'

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
export type Style = { key: string; name: string; schemes: Partial<Record<SchemeKey, Scheme>> & { paper: Scheme }; schemeNames?: Partial<Record<SchemeKey, string>> }

/** Curated display faces; body is always Inter. Bricolage is Frrata's own face and never ships to a shop (brand rule 35). */
export const PAIRINGS = ['fraunces', 'cormorant', 'inter', 'playfair', 'dmserif'] as const
export type Pairing = (typeof PAIRINGS)[number]
export const PAIRING_NAMES: Record<Pairing, string> = { fraunces: 'Fraunces', cormorant: 'Cormorant', inter: 'Inter', playfair: 'Playfair Display', dmserif: 'DM Serif Display' }

export const HEADERS = ['classic', 'centred', 'minimal', 'circles', 'split', 'panel', 'overlay'] as const
export type HeaderVariant = (typeof HEADERS)[number]
export const HEADER_NAMES: Record<HeaderVariant, string> = { classic: 'Classic', centred: 'Centred logo', minimal: 'Minimal', circles: 'Category circles', split: 'Split', panel: 'Centred with a shop panel', overlay: 'Over the photo' }
export const FOOTERS = ['three', 'compact', 'statement', 'gram'] as const
export type FooterVariant = (typeof FOOTERS)[number]
export const FOOTER_NAMES: Record<FooterVariant, string> = { three: 'Three columns', compact: 'Compact', statement: 'Statement', gram: 'Instagram strip' }

export type Announcement = { text: string; link: string | null; scheme: SchemeKey }

/** Every Theme settings control (spec § Theme settings). Each a typed choice; the only free value is the brand colour. */
export type ThemeSettings = {
  pairing: Pairing
  headings: 'as_typed' | 'upper'
  size: 'compact' | 'regular' | 'large'
  corners: 'square' | 'soft' | 'round'
  /** underline: section buttons as underlined words (Studio, 2.0); Add to bag always stays a filled button. */
  buttons: 'solid' | 'outline' | 'underline'
  spacing: 'airy' | 'regular' | 'compact'
  photo: '4:5' | '3:4' | '1:1'
  hoverPhoto: boolean
  phoneColumns: 2 | 3
  header: HeaderVariant
  sticky: boolean
  bottomTabs: boolean
  announcement: Announcement | null
  footer: FooterVariant
  social: boolean
  motion: 'subtle' | 'none'
  /** Replaces the accent in every scheme; accepted only when readable (brandColourProblem). */
  brandColour: Hex | null
} & PageSettings & FeelSettings

/**
 * Pages beyond Home (themes T2). Additive: a manifest may leave them out, and every default is what shops had before
 * T2, so no look changes until a merchant picks something (PAGE_DEFAULTS).
 */
export type PageSettings = {
  /** Product photos: one at a time (today), a thumbnail strip under, (2.0) thumbnails in a column beside, or every
   *  photo stacked on a computer (swiped on a phone). */
  gallery: 'swipe' | 'thumbs' | 'rail' | 'stack'
  /** "About this piece" and "Details": open (today) or folded into disclosures. */
  details: 'open' | 'folded'
  card: 'standard' | 'centred' | 'framed'
  desktopColumns: 3 | 4
  /** A collection page's top: its title (today) or a banner of its photo. */
  collectionTop: 'title' | 'banner'
}
export const PAGE_DEFAULTS: PageSettings = { gallery: 'swipe', details: 'open', card: 'standard', desktopColumns: 4, collectionTop: 'title' }

/**
 * The 2.0 choices (plan 2026-11-09-themes-three): how buttons, cards and pages move, the buy box, the footer's colours
 * and the checkout. Additive like PageSettings: absent = FEEL_DEFAULTS, which is exactly the look before them.
 * `motion: 'none'` and reduced motion turn every movement here off.
 */
export type FeelSettings = {
  /** theme: the theme's corners · pill: fully round, whatever the corners. */
  buttonShape: 'theme' | 'pill'
  /** press: shrinks a touch when pressed (today) · lift: rises on hover · fill: the colour sweeps in on hover. */
  buttonMotion: 'press' | 'lift' | 'fill'
  cardHover: 'none' | 'lift' | 'zoom'
  /** How a page arrives: none (today) · fade · rise. */
  entrance: 'none' | 'fade' | 'rise'
  /** Sections below the first rise in as they scroll into view. */
  reveal: boolean
  /** Computers: the buy box stays beside the photos as they scroll. */
  buyBoxSticky: boolean
  /** Phones: an Add to bag bar at the bottom once the page's own button scrolls away. */
  buyBar: boolean
  footerScheme: SchemeKey
  /** focused: the checkout keeps the logo and the legal footer only (no menu, no announcement, no tabs). */
  checkout: 'standard' | 'focused'
}
export const FEEL_DEFAULTS: FeelSettings = { buttonShape: 'theme', buttonMotion: 'press', cardHover: 'none', entrance: 'none', reveal: false, buyBoxSticky: false, buyBar: false, footerScheme: 'paper', checkout: 'standard' }

/** The settings a theme may narrow per key (allowed.choices). Header, footer and type have their own lists. */
export type ChoiceKey = Exclude<keyof ThemeSettings, 'pairing' | 'header' | 'footer' | 'announcement' | 'brandColour'>
export type Choices = Partial<{ [K in ChoiceKey]: ThemeSettings[K][] }>

export type ThemeManifest = {
  key: string
  /** semver */
  version: string
  name: string
  job: string
  /** What the shop sells, from shop_settings.sells: the gallery lists these themes first. */
  goodFor: string[]
  features: string[]
  styles: Style[]
  /** Page settings (T2) may be left out: PAGE_DEFAULTS fills them. */
  defaults: Omit<ThemeSettings, keyof PageSettings | keyof FeelSettings> & Partial<PageSettings & FeelSettings>
  allowed: { pairings: Pairing[]; headers: HeaderVariant[]; footers: FooterVariant[]; sections: SectionKey[]; heroMasks?: ('none' | 'arch')[]
    /** 2.0: the values this theme offers for a setting (choicesFor). A key left out keeps the values every 1.x theme had. */
    choices?: Choices }
  /** 2.0: the customizer's preview fills an empty shop with sample pieces, and a missing hero photo with this sample scene. */
  samples?: 'festive' | 'studio'
  /** 2.1: the designs made for this theme (shown first, "Made for <theme>"); the rest it allows "fit" it (Look v3). */
  made?: { headers?: HeaderVariant[]; footers?: FooterVariant[]; sections?: SectionKey[] }
  /** 2.0: every section below the hero gets the same space above and below it (the 1.x themes keep their spacing). */
  rhythm?: 'even'
  home: SectionInput[]
}

/** The merchant's layer. Content, never state (which revision is live is a publish row). */
export type ThemeLayer = { style: string; settings?: Partial<ThemeSettings>; home?: unknown[] }

export type ResolvedTheme = {
  key: string; version: string; style: string
  schemes: Record<SchemeKey, Scheme>
  settings: ThemeSettings
  home: SectionInstance[]
  /** From the manifest (2.0): even space between sections. */
  rhythm?: 'even'
}
