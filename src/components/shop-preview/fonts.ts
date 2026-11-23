// A shop's display faces (themes spec § Theme settings › Pairing; body is Inter): Fraunces, Cormorant, Playfair, DM Serif,
// Schibsted (latin and its latin-ext ₹ face), Noto Devanagari for Hindi words and Caveat for the script line. Loaded only
// by the pages that show a shop: the storefront and its previews. None is preloaded (speed review P6).
// Since 2026-11-23 (page weight) they are a generated stylesheet, store-fonts.css, not next/font calls: next/font left a
// JS object per face in every shop page's first load (0.28 kB gzipped). scripts/build-store-fonts.mjs writes it with
// next/font's own loader, so each @font-face, fallback face and variable is what next/font wrote; the faces' options and
// their reasons live there. check:store-fonts (in the gates) fails a stale file.
import './store-fonts.css'

/** The class that gives an element the eight faces' variables (--font-store-fraunces …); store-fonts.css defines it. */
export const STORE_FONT_VARS = 'store-fonts'

import { displayFamily } from './font-families'
export { displayFamily }
