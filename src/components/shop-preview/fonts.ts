import { Cormorant_Garamond, DM_Serif_Display, Fraunces, Playfair_Display } from 'next/font/google'

// A shop's display faces (themes spec § Theme settings › Pairing; body is Inter). Loaded only by the pages that
// show a shop — the storefront and its previews. Latin only. Fraunces and Cormorant keep today's preload (Classic's
// look is held to the pixel); the faces themes added are not preloaded (architecture review: no extra LCP cost
// for shops that don't use them).
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', variable: '--font-store-fraunces' })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', variable: '--font-store-cormorant' })
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', preload: false, variable: '--font-store-playfair' })
const dmserif = DM_Serif_Display({ subsets: ['latin'], weight: ['400'], display: 'swap', preload: false, variable: '--font-store-dmserif' })

export const STORE_FONT_VARS = `${fraunces.variable} ${cormorant.variable} ${playfair.variable} ${dmserif.variable}`

/** The CSS font-family for a shop's display face (a theme's pairing; before themes, shop_settings.display_font). */
export function displayFamily(font: string): string {
  if (font === 'cormorant') return 'var(--font-store-cormorant), Georgia, serif'
  if (font === 'inter') return 'var(--font-inter), system-ui, sans-serif'
  if (font === 'playfair') return 'var(--font-store-playfair), Georgia, serif'
  if (font === 'dmserif') return 'var(--font-store-dmserif), Georgia, serif'
  return 'var(--font-store-fraunces), Georgia, serif'
}
