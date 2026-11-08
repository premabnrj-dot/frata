import { Cormorant_Garamond, DM_Serif_Display, Fraunces, Playfair_Display } from 'next/font/google'
import localFont from 'next/font/local'

// A shop's display faces (themes spec § Theme settings › Pairing; body is Inter). Loaded only by the pages that
// show a shop — the storefront and its previews. Latin only. None is preloaded (speed review P6): every shop page
// preloaded Fraunces and Cormorant whichever face it used, ahead of its main photo; a face downloads when the page
// uses it.
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', preload: false, variable: '--font-store-fraunces' })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', preload: false, variable: '--font-store-cormorant' })
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', preload: false, variable: '--font-store-playfair' })
const dmserif = DM_Serif_Display({ subsets: ['latin'], weight: ['400'], display: 'swap', preload: false, variable: '--font-store-dmserif' })

// Hindi shop words (themes T2): the console's self-hosted Noto Sans Devanagari, used only under [lang="hi"]
// (globals.css) and never preloaded, so an English shop never downloads it.
const deva = localFont({ src: '../shell/noto/noto-sans-devanagari-devanagari-wght-normal.woff2', weight: '100 900', preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-store-deva',
  declarations: [{ prop: 'unicode-range', value: 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+25CC,U+A830-A839,U+A8E0-A8FF' }] })

export const STORE_FONT_VARS = `${fraunces.variable} ${cormorant.variable} ${playfair.variable} ${dmserif.variable} ${deva.variable}`

/** The CSS font-family for a shop's display face (a theme's pairing; before themes, shop_settings.display_font). */
export function displayFamily(font: string): string {
  if (font === 'cormorant') return 'var(--font-store-cormorant), Georgia, serif'
  if (font === 'inter') return 'var(--font-inter), system-ui, sans-serif'
  if (font === 'playfair') return 'var(--font-store-playfair), Georgia, serif'
  if (font === 'dmserif') return 'var(--font-store-dmserif), Georgia, serif'
  return 'var(--font-store-fraunces), Georgia, serif'
}
