import 'server-only'
import { LIMITS, overLimit, withinLimit } from '@/lib/db/rate-limit'

// =============================================================================
// FILE: src/lib/media/import-bucket.ts
//
// THE IMPORT'S UPLOAD BUCKET (plan 2026-11-12-product-import PI·2 · 8): one count per photo, not per width, so 60
// products × 4 photos fit in the 10 minutes the spec allows. A photo's sizes are uploaded smallest first, and every
// photo has a 400 (domains/media/sizes.ts widthsFor). Rules:
// - The 400 starts a photo: refused if this photo id has started already; counts one against the shop
//   (LIMITS.importPhotoShop).
// - A larger size is given only to a photo that started (this window or the one before, so an hour's turn never cuts
//   a photo in half), and a photo gets at most LIMITS.importPhotoSizes.max tokens in all.
// - Every read fails closed: no counter, no token.
// =============================================================================

const started = { ...LIMITS.importPhotoSizes, max: 1 }

/** Whether the shop may have a token for this size of this photo; counts it when yes. */
export async function importToken(tenantId: string, photoId: string, width: number, now = new Date()): Promise<boolean> {
  const photo = `${tenantId}:${photoId}`
  if (width === 400) {
    if (await overLimit(started, photo, now, true)) return false
    if (!(await withinLimit(LIMITS.importPhotoShop, tenantId, now, true))) return false
  } else {
    const before = new Date(now.getTime() - LIMITS.importPhotoSizes.windowSeconds * 1000)
    const begun = (await overLimit(started, photo, now, false)) || (await overLimit(started, photo, before, false))
    if (!begun) return false
  }
  return withinLimit(LIMITS.importPhotoSizes, photo, now, true)
}
