import localFont from 'next/font/local'

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

import { brandFamily } from './font-families'
export { brandFamily }
