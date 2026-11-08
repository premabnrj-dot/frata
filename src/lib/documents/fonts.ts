import 'server-only'
import path from 'node:path'
import { Font } from '@react-pdf/renderer'

// =============================================================================
// FILE: src/lib/documents/fonts.ts — the faces a document is set in (Documents D0).
//
// Inter for Latin and the rupee sign, Noto Sans Devanagari for Hindi names and addresses (React-PDF shapes it:
// conjuncts and the short i stay whole — jsPDF, Ekatan's library, breaks them; tested 2026-11-08). Both OFL,
// vendored in ./fonts and traced into the function (next.config outputFileTracingIncludes): never fetched.
// A family LIST is a fallback chain, glyph by glyph, so one line can mix English and Hindi.
// =============================================================================

const dir = path.join(process.cwd(), 'src/lib/documents/fonts')
const f = (name: string) => path.join(dir, name)

let registered = false
export function registerFonts(): void {
  if (registered) return
  Font.register({ family: 'Inter', fonts: [{ src: f('inter-latin-400-normal.woff'), fontWeight: 400 }, { src: f('inter-latin-600-normal.woff'), fontWeight: 600 }] })
  Font.register({ family: 'InterExt', fonts: [{ src: f('inter-latin-ext-400-normal.woff'), fontWeight: 400 }, { src: f('inter-latin-ext-600-normal.woff'), fontWeight: 600 }] })
  Font.register({ family: 'Noto', fonts: [{ src: f('noto-sans-devanagari-devanagari-400-normal.woff'), fontWeight: 400 }, { src: f('noto-sans-devanagari-devanagari-600-normal.woff'), fontWeight: 600 }] })
  // No hyphenation: a GSTIN, an order number or a name must never break with a hyphen.
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}

/** Body text: Latin first, then Latin Extended, then Devanagari (which also carries ₹). */
export const FAMILY = ['Inter', 'InterExt', 'Noto']
