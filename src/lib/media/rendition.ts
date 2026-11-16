import 'server-only'
import { createHash } from 'node:crypto'
import { BLOB_STORE_ID } from '@/lib/env'
import { storeHost } from '@/domains/media/sizes'
import { renditionPath } from '@/domains/brand/files'

/** The rendition's path for a main logo: the sha256 of its URL, the one place that name is made (one-address P1·4). */
export const renditionPathFor = (tenantId: string, mainUrl: string) => renditionPath(tenantId, createHash('sha256').update(mainUrl).digest('hex'))

/** Where the main logo's PNG rendition is (made by brand-files.ts): derived from the main logo's URL, stored nowhere. Null
 *  without a main logo or a media store. */
export function renditionUrl(tenantId: string, mainUrl: string | null): string | null {
  const host = storeHost(BLOB_STORE_ID)
  return mainUrl && host ? `https://${host}/${renditionPathFor(tenantId, mainUrl)}` : null
}
