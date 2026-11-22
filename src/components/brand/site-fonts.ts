import localFont from 'next/font/local'

// =============================================================================
// FILE: src/components/brand/site-fonts.ts — the website's faces (Rani Mela, owner 2026-11-22).
//
// DM Sans for the website's words, Mukta for its Hindi lines; Bricolage (headlines) comes from SHELL_FONT_VARS.
// Self-hosted (src/components/fonts/, OFL 1.1, from Fontsource 5.3.0, 2026-11-22) like every face. Mukta's
// Devanagari file is 105 kB, so it is not preloaded and its unicode-range keeps it off pages with no Hindi.
// =============================================================================
const dmSans = localFont({ src: '../fonts/dm-sans/dm-sans-latin-wght-normal.woff2', weight: '100 1000', variable: '--font-dm-sans', display: 'swap', preload: true })
const mukta = localFont({ src: '../fonts/mukta/mukta-devanagari-700-normal.woff2', weight: '700', variable: '--font-mukta', display: 'swap', preload: false, adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09' }] })

/** Put on the website page's root element, beside SHELL_FONT_VARS. */
export const SITE_FONT_VARS = `${dmSans.variable} ${mukta.variable}`
