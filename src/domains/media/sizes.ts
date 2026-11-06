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

/** A blob path inside the shop's own folder: tenants/<tenant>/products/<id>-<width>.webp. */
export const PATH_SHAPE = /^tenants\/([0-9a-f-]{36})\/(products|brand)\/([0-9a-f-]{36})-(400|800|1200|1600)\.webp$/

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
export function acceptedBase(raw: string, host: string, tenantId: string, folder: 'products' | 'brand'): string | null {
  if (typeof raw !== 'string' || raw.length > 300 || /[?#%\\\s]/.test(raw)) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const rebuilt = `${u.origin}${u.pathname}`
  if (u.protocol !== 'https:' || u.host !== host || rebuilt !== raw) return null
  const m = PATH_SHAPE.exec(`${u.pathname.slice(1)}-400.webp`)
  return m && m[1] === tenantId && m[2] === folder ? rebuilt : null
}
