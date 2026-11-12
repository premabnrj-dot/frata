import 'server-only'
import { acceptedBase, formatOf, headIs, storeHost, urlFor } from '@/domains/media/sizes'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { BLOB_STORE_ID } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'

/**
 * The upload token trusts the declared type (security review S11): PRODUCT photos (the look's and the logo's are
 * not checked yet; each is served as its declared type with nosniff, so a wrong file shows as a broken image, nothing runs). read the first bytes of each uploaded file, outside
 * any transaction, and accept only the format its base says: WebP, or JPEG for a `.jpg` base (Safari, 2026-11-12). A
 * path outside the shop's folder is left to attachPhotos' own check.
 */
export async function photosAreMade(photos: { base: string; widths: number[] }[]): Promise<boolean> {
  const auth = await requireMember(ANY_MEMBER)
  const host = storeHost(BLOB_STORE_ID)
  if (!auth.ok || !host) return true
  const urls = photos.flatMap((ph) => {
    const base = acceptedBase(String(ph.base ?? ''), host, auth.membership.tenantId, 'products')
    return base && Array.isArray(ph.widths) ? ph.widths.slice(0, 4).map((w) => ({ url: urlFor(base, Number(w)), format: formatOf(base) })) : []
  })
  const heads = await Promise.all(urls.map(async ({ url, format }) => {
    try {
      const res = await fetchWithTimeout(url, { headers: { range: 'bytes=0-11' } }, 5000)
      return { format, head: res.ok ? new Uint8Array(await res.arrayBuffer()).slice(0, 12) : null }
    } catch { return { format, head: null } }
  }))
  // A file we could not read is left to the image pipeline (a missing one 404s there); one we read must be its format.
  return heads.every(({ format, head }) => head === null || headIs(format, head))
}

