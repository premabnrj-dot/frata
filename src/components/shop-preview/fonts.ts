import localFont from 'next/font/local'

// A shop's display faces (themes spec § Theme settings › Pairing; body is Inter). Loaded only by the pages that
// show a shop — the storefront and its previews. Latin only. None is preloaded (speed review P6): every shop page
// preloaded Fraunces and Cormorant whichever face it used, ahead of its main photo; a face downloads when the page
// uses it. Self-hosted (src/components/fonts/, OFL 1.1, from Fontsource 5.3.0, 2026-11-11): next/font/google fetched
// Google at build time and a bad answer failed production builds at random (Vercel, 2026-11-11).
const fraunces = localFont({ src: [{ path: '../fonts/fraunces/fraunces-latin-500-normal.woff2', weight: '500' }, { path: '../fonts/fraunces/fraunces-latin-600-normal.woff2', weight: '600' }], display: 'swap', preload: false, variable: '--font-store-fraunces' })
const cormorant = localFont({ src: [{ path: '../fonts/cormorant-garamond/cormorant-garamond-latin-500-normal.woff2', weight: '500' }, { path: '../fonts/cormorant-garamond/cormorant-garamond-latin-600-normal.woff2', weight: '600' }], display: 'swap', preload: false, variable: '--font-store-cormorant' })
const playfair = localFont({ src: [{ path: '../fonts/playfair-display/playfair-display-latin-500-normal.woff2', weight: '500' }, { path: '../fonts/playfair-display/playfair-display-latin-600-normal.woff2', weight: '600' }], display: 'swap', preload: false, variable: '--font-store-playfair' })
const dmserif = localFont({ src: '../fonts/dm-serif-display/dm-serif-display-latin-400-normal.woff2', weight: '400', display: 'swap', preload: false, variable: '--font-store-dmserif' })
// Theme Signal (speed review 2026-11-09): one weight. Latin, and latin-ext for ₹ as its own face with its own range, so
// its file loads only where a ₹ is on the page.
const schibsted = localFont({ src: '../fonts/schibsted-grotesk/schibsted-grotesk-latin-600-normal.woff2', weight: '600', display: 'swap', preload: false, variable: '--font-store-schibsted',
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' }] })
const schibstedExt = localFont({ src: '../fonts/schibsted-grotesk/schibsted-grotesk-latin-ext-600-normal.woff2', weight: '600', display: 'swap', preload: false, adjustFontFallback: false, variable: '--font-store-schibsted-ext',
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }] })

// Hindi shop words (themes T2): the console's self-hosted Noto Sans Devanagari, used only under [lang="hi"]
// (globals.css) and never preloaded, so an English shop never downloads it.
const deva = localFont({ src: '../shell/noto/noto-sans-devanagari-devanagari-wght-normal.woff2', weight: '100 900', preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-store-deva',
  declarations: [{ prop: 'unicode-range', value: 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+25CC,U+A830-A839,U+A8E0-A8FF' }] })

// Signal 1.2 (S2): Caveat 700 for the Hero's script line and the Statement's wordmark. Self-hosted, ASCII only and
// without its contextual alternates (owner, 2026-11-09: 19.5 kB, not Google's 51 kB); OFL 1.1, no Reserved Font Name
// (./caveat/OFL.txt). Not preloaded: a page fetches it only when it shows a script line. Other characters fall back
// to the grotesk, never to a system "cursive".
const script = localFont({ src: './caveat/caveat-700-ascii.woff2', weight: '700', preload: false, display: 'swap', variable: '--font-store-script', fallback: ['var(--store-display)'] })

export const STORE_FONT_VARS = `${fraunces.variable} ${cormorant.variable} ${playfair.variable} ${dmserif.variable} ${schibsted.variable} ${schibstedExt.variable} ${deva.variable} ${script.variable}`

/** The CSS font-family for a shop's display face (a theme's pairing; before themes, shop_settings.display_font). */
export function displayFamily(font: string): string {
  if (font === 'cormorant') return 'var(--font-store-cormorant), Georgia, serif'
  if (font === 'inter') return 'var(--font-inter), system-ui, sans-serif'
  if (font === 'playfair') return 'var(--font-store-playfair), Georgia, serif'
  if (font === 'dmserif') return 'var(--font-store-dmserif), Georgia, serif'
  if (font === 'schibsted') return 'var(--font-store-schibsted), var(--font-store-schibsted-ext), var(--font-inter), system-ui, sans-serif'
  return 'var(--font-store-fraunces), Georgia, serif'
}
