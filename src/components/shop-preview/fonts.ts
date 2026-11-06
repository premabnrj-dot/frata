import { Cormorant_Garamond, Fraunces } from 'next/font/google'

// A shop's display fonts (shop_settings.display_font). Loaded only by the pages
// that show a shop — its previews in Settings and, in 1B, the storefront.
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', variable: '--font-store-fraunces' })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', variable: '--font-store-cormorant' })

export const STORE_FONT_VARS = `${fraunces.variable} ${cormorant.variable}`

/** The CSS font-family for a shop's display font. */
export function displayFamily(font: string): string {
  if (font === 'cormorant') return 'var(--font-store-cormorant), Georgia, serif'
  if (font === 'inter') return 'var(--font-inter), system-ui, sans-serif'
  return 'var(--font-store-fraunces), Georgia, serif'
}
