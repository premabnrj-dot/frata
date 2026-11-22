import localFont from 'next/font/local'

// =============================================================================
// FILE: src/components/brand/site-fonts.ts — the website's faces (Rani Mela, owner 2026-11-22).
//
// DM Sans for the website's words, Mukta for its Hindi lines; Bricolage (headlines) comes from SHELL_FONT_VARS.
// Self-hosted (src/components/fonts/, OFL 1.1, from Fontsource 5.3.0, 2026-11-22) like every face. Mukta 700 is cut
// to the letters in MUKTA_LETTERS (35 kB, from 105 kB; every Devanagari layout feature kept), not preloaded, and kept
// off pages with no Hindi by its unicode-range. A new Hindi line with a new letter: re-cut it (the test says how);
// until then that letter falls back to Noto Sans Devanagari.
// =============================================================================
const dmSans = localFont({ src: '../fonts/dm-sans/dm-sans-latin-wght-normal.woff2', weight: '100 1000', variable: '--font-dm-sans', display: 'swap', preload: true })
const mukta = localFont({ src: '../fonts/mukta/mukta-devanagari-700-home.woff2', weight: '700', variable: '--font-mukta', display: 'swap', preload: false, adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09' }] })

/** Put on the website page's root element, beside SHELL_FONT_VARS. */
export const SITE_FONT_VARS = `${dmSans.variable} ${mukta.variable}`

/** The Devanagari letters the Mukta file holds (python3 -m fontTools.subset <Fontsource mukta-devanagari-700-normal.woff2>
 *  --text="<these letters>" --layout-features='*' --flavor=woff2). */
export const MUKTA_LETTERS = 'ँअइएऑकगछटडतनपफबमरलसह़ािीुूेो्'
