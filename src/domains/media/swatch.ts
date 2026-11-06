// =============================================================================
// FILE: src/domains/media/swatch.ts
//
// A SWATCH CUT FROM A PRODUCT PHOTO: a circle (centre x, y and radius r, as
// fractions of the photo's WIDTH for r, of width/height for x/y) drawn as the
// photo scaled and shifted behind a round box. One formula for the console's
// preview and the shop's swatches. Pure.
// =============================================================================

export type Crop = { x: number; y: number; r: number }

/** CSS background size and position (px) that show `crop` of a w×h photo in a d-px circle. */
export function swatchBackground(crop: Crop, w: number, h: number, d: number) {
  const bw = d / (2 * crop.r), bh = (bw * h) / w
  return { size: `${round(bw)}px ${round(bh)}px`, position: `${round(d / 2 - crop.x * bw)}px ${round(d / 2 - crop.y * bh)}px` }
}

/** Keep the circle inside the photo. */
export function clampCrop(c: Crop, w: number, h: number): Crop {
  const r = Math.min(Math.max(c.r, 0.03), 0.5, (h / w) / 2)
  const ry = (r * w) / h
  return { r, x: Math.min(Math.max(c.x, r), 1 - r), y: Math.min(Math.max(c.y, ry), 1 - ry) }
}

const round = (n: number) => Math.round(n * 10) / 10
