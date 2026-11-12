// =============================================================================
// FILE: src/domains/media/sizes.ts
//
// THE PHOTO SIZE LADDER, shared by the browser (which makes the sizes before
// uploading) and the server (which accepts only these). Made once at upload,
// served as they are: no per-view resizing to pay for (ADR-0005). WebP, or JPEG
// where the browser cannot make WebP (Safari on an iPhone returns PNG for
// 'image/webp', 2026-11-12). ONE format per photo, said by its stored base: a
// JPEG photo's base ends in `.jpg` (`<id>.jpg` → `<id>-<w>.jpg`); any other base
// is WebP (`<id>` → `<id>-<w>.webp`), as every photo stored before. `urlFor` is
// the one place a file's name is built from a base.
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

export type PhotoFormat = 'webp' | 'jpeg'
const JPG = '.jpg'

/** A photo's format, from its stored base (see the header). */
export const formatOf = (base: string): PhotoFormat => (base.endsWith(JPG) ? 'jpeg' : 'webp')

/** The base to store for a photo uploaded as `id` (its files' common prefix) in `format`. */
export const baseFor = (prefix: string, format: PhotoFormat) => (format === 'jpeg' ? `${prefix}${JPG}` : prefix)

/** The content type a photo's files are uploaded and served as. */
export const contentTypeOf = (format: PhotoFormat) => (format === 'jpeg' ? 'image/jpeg' : 'image/webp')

/** One size's file: `<prefix>-<w>.webp`, or `<prefix>-<w>.jpg` for a JPEG photo. */
export const urlFor = (base: string, width: number) =>
  formatOf(base) === 'jpeg' ? `${base.slice(0, -JPG.length)}-${width}.jpg` : `${base}-${width}.webp`

/** Where the browser uploads one size of a new photo (PATH_SHAPE's shape). */
export const blobPath = (tenantId: string, folder: 'products' | 'brand' | 'theme', id: string, width: number, format: PhotoFormat) =>
  urlFor(baseFor(`tenants/${tenantId}/${folder}/${id}`, format), width)

/** The base to store from one uploaded size's URL. */
export const baseFromUpload = (url: string, format: PhotoFormat) => baseFor(url.replace(/-\d+\.(webp|jpg)$/, ''), format)

/** srcset for an <img>: each pre-made width. */
export function srcSet(base: string, widths: readonly number[]): string {
  return widths.map((w) => `${urlFor(base, w)} ${w}w`).join(', ')
}

/** The smallest made width at least `target` wide (or the largest there is). */
export function pick(widths: readonly number[], target: number): number {
  return [...widths].sort((a, b) => a - b).find((w) => w >= target) ?? Math.max(...widths)
}

/** A blob path inside the shop's own folder: tenants/<tenant>/<products|brand|theme>/<id>-<width>.<webp|jpg> (theme: a
 * look's photos, T1). Group 5 is the extension. */
export const PATH_SHAPE = /^tenants\/([0-9a-f-]{36})\/(products|brand|theme)\/([0-9a-f-]{36})-(400|800|1200|1600)\.(webp|jpg)$/

/** The format a blob path's extension says. */
export const formatOfPath = (ext: string): PhotoFormat => (ext === 'jpg' ? 'jpeg' : 'webp')

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
  // The base's own first file must have the path shape (a `.jpg` base: its JPEG files).
  const m = PATH_SHAPE.exec(urlFor(u.pathname.slice(1), 400))
  return m && m[1] === tenantId && m[2] === folder ? rebuilt : null
}

/** A WebP file starts "RIFF" <size> "WEBP" (security review S11: the upload token trusts the declared type). */
export function isWebp(head: Uint8Array): boolean {
  const s = (a: number, b: number) => String.fromCharCode(...head.slice(a, b))
  return head.length >= 12 && s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP'
}

/** A file's first bytes are the format its photo's base says (WebP, or JPEG for a `.jpg` base). */
export const headIs = (format: PhotoFormat, head: Uint8Array): boolean => (format === 'jpeg' ? imageKind(head) === 'jpeg' : isWebp(head))

/** The logo for paper (Documents D2): one PNG per upload in the shop's documents folder, at most 1 MB. */
export const DOC_LOGO_SHAPE = /^tenants\/([0-9a-f-]{36})\/documents\/([0-9a-f-]{36})\.png$/
export const MAX_DOC_IMAGE_BYTES = 1024 * 1024
/** Longest side of a logo for paper, in pixels (enough for 300 dpi at the masthead's size). */
export const DOC_LOGO_PX = 600
/** The largest image a document will decode, a side, whatever made it (the loader's cap). */
export const MAX_DOC_IMAGE_PX = 2000

/** A PNG starts \x89PNG\r\n\x1a\n; a JPEG starts FF D8 FF (React-PDF reads only these two). */
export function imageKind(head: Uint8Array): 'png' | 'jpeg' | null {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return 'png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  return null
}

/** PNG pixel size from its IHDR (bytes 16–23); null when it is not a PNG. */
export function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (imageKind(b) !== 'png' || b.length < 24 || String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== 'IHDR') return null
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
