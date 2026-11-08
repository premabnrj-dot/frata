import 'server-only'
import { acceptedBase, isWebp, storeHost, urlFor } from '@/domains/media/sizes'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { BLOB_STORE_ID } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'

/**
 * The upload token trusts the declared type (security review S11): read the first bytes of each uploaded file, outside
 * any transaction, and accept only WebP. A path outside the shop's folder is left to attachPhotos' own check.
 */
export async function photosAreWebp(photos: { base: string; widths: number[] }[]): Promise<boolean> {
  const auth = await requireMember(ANY_MEMBER)
  const host = storeHost(BLOB_STORE_ID)
  if (!auth.ok || !host) return true
  const urls = photos.flatMap((ph) => {
    const base = acceptedBase(String(ph.base ?? ''), host, auth.membership.tenantId, 'products')
    return base && Array.isArray(ph.widths) ? ph.widths.slice(0, 4).map((w) => urlFor(base, Number(w))) : []
  })
  const heads = await Promise.all(urls.map(async (u) => {
    try {
      const res = await fetchWithTimeout(u, { headers: { range: 'bytes=0-11' } }, 5000)
      return res.ok ? new Uint8Array(await res.arrayBuffer()).slice(0, 12) : null
    } catch { return null }
  }))
  // A file we could not read is left to the image pipeline (a missing one 404s there); one we read must be WebP.
  return heads.every((h) => h === null || isWebp(h))
}

