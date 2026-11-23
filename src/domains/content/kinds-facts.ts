// =============================================================================
// FILE: src/domains/content/kinds-facts.ts — the half of kinds.ts a browser may load: the kinds, keys, names and caps,
// no zod (page weight, 2026-11-23: Console › Content's forms imported these and shipped all of zod). kinds.ts
// re-exports everything here; the save and read checks stay there, on the server.
// =============================================================================

export const CONTENT_KINDS = ['announcement', 'menu', 'contact'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]
export const MENU_KEYS = ['main', 'footer', 'tabs'] as const
export type MenuKey = (typeof MENU_KEYS)[number]
export const CONTACT_KEY = 'contact'
/** How many bars a store keeps (live, scheduled or ended, not deleted). */
export const MAX_BARS = 3
/** A menu's items at every level together (Zod alone would allow 12 × 12 × 12). */
export const MAX_MENU_ITEMS = 60
export const BAR_SCHEMES = ['paper', 'tint', 'ink'] as const
export const BAR_TEXT_MAX = 120
export const CONTACT_MAX = 160
export const MENU_NAMES: Record<MenuKey, string> = { main: 'Main menu', footer: 'Footer menu', tabs: 'Phone tabs' }
