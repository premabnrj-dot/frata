import localFont from 'next/font/local'
import { displayFamily } from './fonts'

// =============================================================================
// FILE: src/components/shop-preview/brand-fonts.ts — the brand record's extra faces for Console › Brand only (one-address
// P1·8). Kept out of fonts.ts: next/font writes a face's @font-face wherever its module is imported, and fonts.ts is the
// store's own (a theme shop's CSS budget, check:storefront-build).
// =============================================================================

// One brand record (one-address P1·8, owner call 2): Mukta and Tiro Devanagari Hindi join the list for code-site stores'
// brand previews. Self-hosted the same way (Fontsource 5.3.0, OFL 1.1, 2026-11-16), Latin only, never preloaded.
const mukta = localFont({ src: [{ path: '../fonts/mukta/mukta-latin-400-normal.woff2', weight: '400' }, { path: '../fonts/mukta/mukta-latin-600-normal.woff2', weight: '600' }], display: 'swap', preload: false, variable: '--font-store-mukta' })
const tiro = localFont({ src: '../fonts/tiro-devanagari-hindi/tiro-devanagari-hindi-latin-400-normal.woff2', weight: '400', display: 'swap', preload: false, variable: '--font-store-tiro' })

/** The brand faces' variables beside the store's (Console › Brand only; a theme shop's pages never load them). */
export const BRAND_FONT_VARS = `${mukta.variable} ${tiro.variable}`

/** A brand record's font on Frrata's own pages (Console › Brand's preview): the self-hosted face by its variable, then a
 *  fallback of its kind. What leaves Frrata (the API, the kit) names the family instead (src/domains/brand/record.ts). */
export function brandFamily(font: string): string {
  if (font === 'mukta') return 'var(--font-store-mukta), var(--font-store-deva), system-ui, sans-serif'
  if (font === 'tiro') return 'var(--font-store-tiro), var(--font-store-deva), Georgia, serif'
  return displayFamily(font)
}
