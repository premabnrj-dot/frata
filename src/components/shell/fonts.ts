import localFont from 'next/font/local'

// =============================================================================
// FILE: src/components/shell/fonts.ts
//
// THE SHELL'S FONT STACK (Console, Admin and the sign-in pages; never html,
// never the shop). Inter has no Indic glyphs, so customer and shop names in
// Devanagari, Bengali, Gurmukhi and Tamil fall back to Noto Sans. The files
// are committed (./noto, OFL 1.1, from @fontsource-variable/* 5.3.0, each
// script's own subset, variable weight) so a build fetches nothing for them
// (impact review U·1: four Google families multiplied today's transient
// next/font failure). preload off, Inter first, and each face's
// unicode-range: a browser downloads a Noto file only when a glyph on the page
// needs it; the 90-ux flow checks that. Telugu, Kannada, Malayalam, Gujarati
// and Odia join when real orders carry them. next/font needs literal options.
// =============================================================================
const deva = localFont({ src: './noto/noto-sans-devanagari-devanagari-wght-normal.woff2', weight: '100 900', preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-noto-deva',
  declarations: [{ prop: 'unicode-range', value: 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09' }] })
const beng = localFont({ src: './noto/noto-sans-bengali-bengali-wght-normal.woff2', weight: '100 900', preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-noto-beng',
  declarations: [{ prop: 'unicode-range', value: 'U+0951-0952,U+0964-0965,U+0980-09FE,U+1CD0,U+1CD2,U+1CD5-1CD6,U+1CD8,U+1CE1,U+1CEA,U+1CED,U+1CF2,U+1CF5-1CF7,U+200C-200D,U+20B9,U+25CC,U+A8F1' }] })
const guru = localFont({ src: './noto/noto-sans-gurmukhi-gurmukhi-wght-normal.woff2', weight: '100 900', preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-noto-guru',
  declarations: [{ prop: 'unicode-range', value: 'U+0951-0952,U+0964-0965,U+0A01-0A76,U+200C-200D,U+20B9,U+25CC,U+262C,U+A830-A839' }] })
const taml = localFont({ src: './noto/noto-sans-tamil-tamil-wght-normal.woff2', weight: '100 900', preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-noto-taml',
  declarations: [{ prop: 'unicode-range', value: 'U+0964-0965,U+0B82-0BFA,U+200C-200D,U+20B9,U+25CC' }] })

/**
 * THE DISPLAY FACE (brand spec 2026-11-07, chapter 3): Bricolage Grotesque, OFL 1.1, from
 * @fontsource-variable/bricolage-grotesque 5.3.0 — the latin subset, weight axis only (41,344 bytes; budget 48 KB),
 * committed like the Noto faces so a build fetches nothing for it. Used at 600 for page titles, the brand moment and
 * brand empty states (font-display); everything a merchant works with stays Inter. Never on a shop: only shell
 * pages carry SHELL_FONT_VARS (check:storefront-build).
 */
const display = localFont({ src: './display/bricolage-grotesque-latin-wght-normal.woff2', weight: '200 800', preload: true, display: 'swap', variable: '--font-bricolage' })

/** Put on the shell's root element, beside data-shell: it defines the variables the stack in globals.css reads. */
export const SHELL_FONT_VARS = `${deva.variable} ${beng.variable} ${guru.variable} ${taml.variable} ${display.variable}`
