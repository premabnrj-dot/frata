import 'server-only'
import { accentOf } from '@/domains/brand/accent'
import { shopBrand } from '@/lib/queries/brand'
import { afterMainLogo, ensureRendition, rasterLogoMade } from '@/lib/media/brand-files'
import { renditionUrl } from '@/lib/media/rendition'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/email/brand.ts — WHAT A STORE'S EMAIL WEARS (one-address plan P1·5; spec § 5 "Emails: the record; the
// PNG rendition"). A code-site store: its brand record's accent and the text on it (a live season's while one runs) and
// its main logo as the PNG rendition (mail clients read neither SVG nor WebP reliably), made first if it isn't yet. A
// theme shop: its look's accent and its logo, white text, as before (O19). The sender and the Settings preview share it.
// =============================================================================

/** `wait`: the sender makes a missing rendition before it sends (a sent email is never fixed, so it names the store
 *  instead of linking a file that isn't there); the Settings preview never waits on file work and makes it after. */
export async function emailBrand(tenantId: string, themeAccent: string, logoUrl: string | null, now: Date, wait = true): Promise<{ accent: string; on: string | null; logoUrl: string | null }> {
  const b = await shopBrand(tenantId).catch((e: unknown) => { console.error('[email brand]', errName(e)); return null })
  // A theme shop: as before. Its logo is raster, unless the store was a code site once (its last key deleted): then an
  // SVG logo goes as its PNG only once made, else the name (architecture review).
  if (!b) return { accent: themeAccent, on: null, logoUrl: logoUrl && /\.svg$/.test(logoUrl) ? (wait ? await rasterLogoMade(tenantId, logoUrl) : null) : logoUrl }
  const { accent, on } = accentOf(b.record, b.seasons, now, themeAccent)
  const main = b.record.logos.main
  if (!main) return { accent, on, logoUrl: null }
  if (!wait) { afterMainLogo(tenantId, main); return { accent, on, logoUrl: renditionUrl(tenantId, main) } }
  return { accent, on, logoUrl: (await ensureRendition(tenantId, main)) ? renditionUrl(tenantId, main) : null }
}
