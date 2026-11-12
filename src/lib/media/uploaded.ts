import 'server-only'
import { acceptedBase, formatOf, headIs, storeHost, urlFor } from '@/domains/media/sizes'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { BLOB_STORE_ID } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'

/**
 * The upload token trusts the declared type (security review S11): PRODUCT photos (the look's and the logo's are
 * not checked yet; each is served as its declared type with nosniff, so a wrong file shows as a broken image, nothing runs). read the first bytes of each uploaded file, outside
 * any transaction, and accept only the format its base says: WebP, or JPEG for a `.jpg` base (Safari, 2026-11-12).
 * Every size named must be read: a file that is missing, answers anything but 2xx, or does not answer in time refuses
 * the photo (security review PI·2). A path outside the shop's folder is left to attachIn's own check.
 */
export async function photosAreMade(photos: { base: string; widths: number[] }[], waits: readonly number[] = [500, 1500]): Promise<boolean> {
  const auth = await requireMember(ANY_MEMBER)
  const host = storeHost(BLOB_STORE_ID)
  if (!auth.ok || !host) return true
  const urls = photos.flatMap((ph) => {
    const base = acceptedBase(String(ph.base ?? ''), host, auth.membership.tenantId, 'products')
    return base && Array.isArray(ph.widths) ? ph.widths.slice(0, 4).map((w) => ({ url: urlFor(base, Number(w)), format: formatOf(base) })) : []
  })
  // A file just uploaded may not answer at once: a size that is missing or silent is asked again twice (0.5 s, then
  // 1.5 s) before it refuses the photo; wrong bytes refuse at once.
  const read = async (url: string) => {
    try {
      const res = await fetchWithTimeout(url, { headers: { range: 'bytes=0-11' } }, 5000)
      return res.ok ? new Uint8Array(await res.arrayBuffer()).slice(0, 12) : null
    } catch { return null }
  }
  const heads = await Promise.all(urls.map(async ({ url, format }) => {
    let head = await read(url)
    for (const wait of waits) {
      if (head) break
      await new Promise((r) => setTimeout(r, wait))
      head = await read(url)
    }
    return { format, head }
  }))
  return heads.every(({ format, head }) => head !== null && headIs(format, head))
}

