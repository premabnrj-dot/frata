import 'server-only'
import { LIMITS, overLimit, withinLimit } from '@/lib/db/rate-limit'

// =============================================================================
// FILE: src/lib/media/import-bucket.ts
//
// THE IMPORT'S UPLOAD BUCKET (plan 2026-11-12-product-import PI·2 · 8): one count per photo, not per width, so 60
// products × 4 photos fit in the 10 minutes the spec allows. A photo's sizes are uploaded smallest first, and every
// photo has a 400 (domains/media/sizes.ts widthsFor). Rules:
// - The 400 starts a photo: it alone writes the photo's start (LIMITS.importPhotoStart, once a photo id); a second
//   400 for the same id is refused. It counts one against the shop's hour and day (importPhotoShop, ...ShopDay).
// - A larger size is given only to a photo whose start is in this hour's window or the one before (so an hour's turn
//   never cuts a photo in half, and a photo older than two windows gets nothing), at most
//   LIMITS.importPhotoSizes.max of them in a window.
// - Every read fails closed: no counter, no token.
// =============================================================================

/** Whether the shop may have a token for this size of this photo; counts it when yes. */
export async function importToken(tenantId: string, photoId: string, width: number, now = new Date()): Promise<boolean> {
  const photo = `${tenantId}:${photoId}`
  if (width === 400) {
    if (!(await withinLimit(LIMITS.importPhotoStart, photo, now, true))) return false
    if (!(await withinLimit(LIMITS.importPhotoShop, tenantId, now, true))) return false
    return withinLimit(LIMITS.importPhotoShopDay, tenantId, now, true)
  }
  const before = new Date(now.getTime() - LIMITS.importPhotoStart.windowSeconds * 1000)
  // overLimit with max 1: true once the start was written in that window. A failed read is "not started".
  const begun = (await overLimit(LIMITS.importPhotoStart, photo, now, false)) || (await overLimit(LIMITS.importPhotoStart, photo, before, false))
  if (!begun) return false
  return withinLimit(LIMITS.importPhotoSizes, photo, now, true)
}
