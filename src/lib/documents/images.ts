import 'server-only'
import { acceptedDocLogo, imageKind, MAX_DOC_IMAGE_BYTES, pngSize, storeHost } from '@/domains/media/sizes'
import { BLOB_STORE_ID } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/documents/images.ts — the bytes of a logo for paper (Documents D2; plan finding 3). The renderers
// fetch nothing; this does, for them: only from our own Blob store, only this shop's documents folder, PNG by its
// magic bytes, at most 1 MB and 2000 px a side. Anything else is no logo (the document shows the shop's initial).
// A logo's path is never overwritten (upload: allowOverwrite false), so its bytes are cached for the process.
// =============================================================================

const MAX_PX = 2000
const cache = new Map<string, Uint8Array | null>()

export async function docImage(url: string | null, tenantId: string): Promise<Uint8Array | null> {
  if (!url) return null
  const host = storeHost(BLOB_STORE_ID)
  const ok = host ? acceptedDocLogo(url, host, tenantId) : null
  if (!ok) return null
  if (cache.has(ok)) return cache.get(ok)!
  const bytes = await load(ok)
  if (cache.size > 64) cache.delete(cache.keys().next().value!)
  cache.set(ok, bytes)
  return bytes
}

async function load(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetchWithTimeout(url, { redirect: 'error' }, 5_000)
    if (!res.ok) return null
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > MAX_DOC_IMAGE_BYTES) return null
    const b = new Uint8Array(await res.arrayBuffer())
    if (b.byteLength > MAX_DOC_IMAGE_BYTES || imageKind(b) !== 'png') return null
    const size = pngSize(b)
    return size && size.width > 0 && size.height > 0 && size.width <= MAX_PX && size.height <= MAX_PX ? b : null
  } catch (e) {
    console.error('[documents] logo', errName(e))
    return null
  }
}
