import { Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Gurmukhi, Noto_Sans_Tamil } from 'next/font/google'

// =============================================================================
// FILE: src/components/shell/fonts.ts
//
// THE SHELL'S FONT STACK (Console and Admin only; never html, never the shop).
// Inter has no Indic glyphs, so customer and shop names in Devanagari, Bengali,
// Gurmukhi and Tamil fall back to Noto. preload: false and Inter first: a
// browser fetches a Noto file only when a glyph on the page needs it (its
// @font-face unicode-range), so a Latin-only page downloads none. The 90-ux
// flow checks that (plan U · A4). Telugu, Kannada, Malayalam, Gujarati and Odia
// join when real orders carry them.
// =============================================================================
// Variable fonts: no weight list. next/font needs literal options (no spread), hence the repetition.
const deva = Noto_Sans_Devanagari({ subsets: ['devanagari'], preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-noto-deva' })
const beng = Noto_Sans_Bengali({ subsets: ['bengali'], preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-noto-beng' })
const guru = Noto_Sans_Gurmukhi({ subsets: ['gurmukhi'], preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-noto-guru' })
const taml = Noto_Sans_Tamil({ subsets: ['tamil'], preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-noto-taml' })

/** Put on the shell's root element, beside data-shell: it defines the variables the stack in globals.css reads. */
export const SHELL_FONT_VARS = `${deva.variable} ${beng.variable} ${guru.variable} ${taml.variable}`
