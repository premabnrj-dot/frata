// =============================================================================
// FILE: src/domains/media/sizes.ts
//
// THE PHOTO SIZE LADDER, shared by the browser (which makes the sizes before
// uploading) and the server (which accepts only these). Made once at upload,
// served as they are: no per-view resizing to pay for (ADR-0005). WebP only.
// 1200 is there for 3× phone screens, so a cover stays near its 150 kB budget.
// =============================================================================

export const WIDTHS = [400, 800, 1200, 1600] as const
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

/** The widths to make from a photo this wide: never larger than the photo, always at least the smallest. */
export function widthsFor(sourceWidth: number): number[] {
  const fit = WIDTHS.filter((w) => w <= sourceWidth)
  return fit.length ? [...fit] : [WIDTHS[0]]
}

export const urlFor = (base: string, width: number) => `${base}-${width}.webp`

/** srcset for an <img>: each pre-made width. */
export function srcSet(base: string, widths: readonly number[]): string {
  return widths.map((w) => `${urlFor(base, w)} ${w}w`).join(', ')
}

/** The smallest made width at least `target` wide (or the largest there is). */
export function pick(widths: readonly number[], target: number): number {
  return [...widths].sort((a, b) => a - b).find((w) => w >= target) ?? Math.max(...widths)
}

/** A blob path inside the shop's own folder: tenants/<tenant>/<products|brand|theme>/<id>-<width>.webp (theme: a look's photos, T1). */
export const PATH_SHAPE = /^tenants\/([0-9a-f-]{36})\/(products|brand|theme)\/([0-9a-f-]{36})-(400|800|1200|1600)\.webp$/

/** The public host of a Vercel Blob store: store_ROPY6… → ropy6….public.blob.vercel-storage.com. */
export function storeHost(storeId: string): string | null {
  const m = /^store_([A-Za-z0-9]+)$/.exec(storeId.trim())
  return m ? `${m[1]!.toLowerCase()}.public.blob.vercel-storage.com` : null
}

/**
 * A photo's base URL as the browser reports it, accepted only if it is EXACTLY
 * https://<our store>/tenants/<this tenant>/<folder>/<uuid> — no query, fragment,
 * escapes, backslashes or dot segments (a URL parser would clean those up, and
 * the raw string is what gets stored and later deleted; tenancy audit 2026-11-06).
 * Returns the rebuilt URL to store, never the input.
 */
export function acceptedBase(raw: string, host: string, tenantId: string, folder: 'products' | 'brand' | 'theme'): string | null {
  if (typeof raw !== 'string' || raw.length > 300 || /[?#%\\\s]/.test(raw)) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const rebuilt = `${u.origin}${u.pathname}`
  if (u.protocol !== 'https:' || u.host !== host || rebuilt !== raw) return null
  const m = PATH_SHAPE.exec(`${u.pathname.slice(1)}-400.webp`)
  return m && m[1] === tenantId && m[2] === folder ? rebuilt : null
}

/** A WebP file starts "RIFF" <size> "WEBP" (security review S11: the upload token trusts the declared type). */
export function isWebp(head: Uint8Array): boolean {
  const s = (a: number, b: number) => String.fromCharCode(...head.slice(a, b))
  return head.length >= 12 && s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP'
}

/** The logo for paper (Documents D2): one PNG per upload in the shop's documents folder, at most 1 MB. */
export const DOC_LOGO_SHAPE = /^tenants\/([0-9a-f-]{36})\/documents\/([0-9a-f-]{36})\.png$/
export const MAX_DOC_IMAGE_BYTES = 1024 * 1024
/** Longest side of a logo for paper, in pixels (enough for 300 dpi at the masthead's size). */
export const DOC_LOGO_PX = 600

/** A PNG starts \x89PNG\r\n\x1a\n; a JPEG starts FF D8 FF (React-PDF reads only these two). */
export function imageKind(head: Uint8Array): 'png' | 'jpeg' | null {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return 'png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  return null
}

/** PNG pixel size from its IHDR (bytes 16–23); null when it is not a PNG. */
export function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (imageKind(b) !== 'png' || b.length < 24) return null
  const u32 = (o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0
  return { width: u32(16), height: u32(20) }
}

/** A logo-for-paper URL, accepted only as EXACTLY https://<our store>/tenants/<this tenant>/documents/<uuid>.png. */
export function acceptedDocLogo(raw: string, host: string, tenantId: string): string | null {
  if (typeof raw !== 'string' || raw.length > 300 || /[?#%\\\s]/.test(raw)) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:' || u.host !== host || `${u.origin}${u.pathname}` !== raw) return null
  const m = DOC_LOGO_SHAPE.exec(u.pathname.slice(1))
  return m && m[1] === tenantId ? raw : null
}
