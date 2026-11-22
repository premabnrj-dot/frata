// =============================================================================
// FILE: src/components/shop-preview/font-families.ts — a store's faces as CSS font-family strings, and nothing else
// (one-address P2·5). The faces themselves are loaded by fonts.ts and brand-fonts.ts (next/font, which writes their
// @font-face wherever the module is imported); a module that only names a family, like the console's lazily loaded
// checkout preview, imports this one so no font CSS (and no async-CSS runtime) follows it. fonts.ts and brand-fonts.ts
// re-export these: one home.
// =============================================================================

/** The CSS font-family for a shop's display face (a theme's pairing; before themes, shop_settings.display_font). */
export function displayFamily(font: string): string {
  if (font === 'cormorant') return 'var(--font-store-cormorant), Georgia, serif'
  if (font === 'inter') return 'var(--font-inter), system-ui, sans-serif'
  if (font === 'playfair') return 'var(--font-store-playfair), Georgia, serif'
  if (font === 'dmserif') return 'var(--font-store-dmserif), Georgia, serif'
  if (font === 'schibsted') return 'var(--font-store-schibsted), var(--font-store-schibsted-ext), var(--font-inter), system-ui, sans-serif'
  return 'var(--font-store-fraunces), Georgia, serif'
}

/** A brand record's font on Frrata's own pages (Console › Brand's preview): the self-hosted face by its variable, then a
 *  fallback of its kind. What leaves Frrata (the API, the kit) names the family instead (src/domains/brand/record.ts). */
export function brandFamily(font: string): string {
  if (font === 'mukta') return 'var(--font-store-mukta), var(--font-store-deva), system-ui, sans-serif'
  if (font === 'tiro') return 'var(--font-store-tiro), var(--font-store-deva), Georgia, serif'
  return displayFamily(font)
}
