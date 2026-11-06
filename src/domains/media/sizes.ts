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
