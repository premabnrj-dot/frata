import 'server-only'
import { del } from '@vercel/blob'
import { acceptedBase, storeHost, urlFor } from '@/domains/media/sizes'
import { BLOB_READ_WRITE_TOKEN, BLOB_STORE_ID } from '@/lib/env'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/catalogue/photo-files.ts
//
// DELETING A PRODUCT PHOTO'S FILES, after the commit that removed its rows (products PR·1 plan: one helper, three
// callers — a removed photo, an import's drafts, products deleted from the list). Only bases exactly inside this
// shop's folder (acceptedBase) are touched; the caller has already asked photosInUse which are still shown. The call
// waits at most 10 s; a failure is logged, never shown (the rows are gone, the files are orphans a sweep can find).
// =============================================================================

export async function removePhotoFiles(tenantId: string, photos: readonly { base: string; widths: readonly number[] }[], who: string): Promise<void> {
  const host = storeHost(BLOB_STORE_ID)
  if (!host || !BLOB_READ_WRITE_TOKEN) return
  const files = photos.filter((p) => acceptedBase(p.base, host, tenantId, 'products') === p.base).flatMap((p) => p.widths.map((w) => urlFor(p.base, w)))
  if (!files.length) return
  await del(files, { token: BLOB_READ_WRITE_TOKEN, abortSignal: AbortSignal.timeout(10_000) }).catch((e) => console.error(`[${who}] blob delete`, errName(e)))
}
