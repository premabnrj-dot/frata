// =============================================================================
// FILE: src/domains/brand/files.ts — WHERE A BRAND'S FILES LIVE (one-address plan P1·3, P1·4; spec § 5). Every file is
// in the store's own folder of Frrata's media store, accepted only in its exact shape (no query, escape or dot segment;
// the rebuilt string is stored, never the input):
//   raster logo   tenants/<t>/brand/<uuid>-400.webp|jpg   the browser makes it, as a photo (media/sizes.ts)
//   SVG logo      tenants/<t>/brand/<sha256>.svg           Frrata's server writes it, cleaned (lib/media/brand-files.ts)
//   PNG rendition tenants/<t>/documents/<sha256>.png       Frrata's server makes it from the main logo, for paper and
//                                                          email; its name is the sha256 of the main logo's URL, so every
//                                                          reader derives it and nothing stores it twice
// The CHECKs in drizzle/0153 hold the first two in the database. Pure.
// =============================================================================

import { PATH_SHAPE } from '@/domains/media/sizes'

export const SVG_SHAPE = /^tenants\/([0-9a-f-]{36})\/brand\/([0-9a-f]{64})\.svg$/

export type BrandFile = { url: string; kind: 'raster' | 'svg' }

/** A logo URL as the browser sent it, accepted only as this store's own brand file in its exact shape. */
export function acceptedBrandFile(raw: unknown, host: string, tenantId: string): BrandFile | null {
  if (typeof raw !== 'string' || raw.length > 300 || /[?#%\\\s]/.test(raw)) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:' || u.host !== host || `${u.origin}${u.pathname}` !== raw) return null
  const path = u.pathname.slice(1)
  const svg = SVG_SHAPE.exec(path)
  if (svg) return svg[1] === tenantId ? { url: raw, kind: 'svg' } : null
  const r = PATH_SHAPE.exec(path)
  return r && r[1] === tenantId && r[2] === 'brand' && r[4] === '400' ? { url: raw, kind: 'raster' } : null
}

export const svgPath = (tenantId: string, sha256: string) => `tenants/${tenantId}/brand/${sha256}.svg`
export const renditionPath = (tenantId: string, mainUrlSha256: string) => `tenants/${tenantId}/documents/${mainUrlSha256}.png`
/** A raster logo's photo base (what photosAreMade checks), from its stored 400 px URL. */
export const rasterBase = (url: string) => url.replace(/-400\.webp$/, '').replace(/-400\.jpg$/, '.jpg')
