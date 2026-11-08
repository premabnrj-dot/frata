import 'server-only'
import { inflateSync } from 'node:zlib'
import { acceptedDocLogo, imageKind, MAX_DOC_IMAGE_BYTES, MAX_DOC_IMAGE_PX as MAX_PX, pngSize, storeHost } from '@/domains/media/sizes'
import { BLOB_STORE_ID } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/documents/images.ts — the bytes of a logo for paper (Documents D2; plan finding 3). The renderers
// fetch nothing; this does, for them: only from our own Blob store, only this shop's documents folder, PNG by its
// magic bytes, at most 1 MB and 2000 px a side, and image data that inflates within that size. Anything else is no logo (the document shows the shop's initial).
// A logo's path is never overwritten (upload: allowOverwrite false), so its bytes are cached for the process.
// =============================================================================

const cache = new Map<string, Uint8Array | null>()

export async function docImage(url: string | null, tenantId: string): Promise<Uint8Array | null> {
  if (!url) return null
  const host = storeHost(BLOB_STORE_ID)
  const ok = host ? acceptedDocLogo(url, host, tenantId) : null
  if (!ok) return null
  if (cache.has(ok)) return cache.get(ok)!
  const { bytes, final } = await load(ok)
  // Only a success or a definite refusal (missing, wrong bytes) is kept: a timeout or a 5xx is tried again next time.
  if (final) {
    if (cache.size > 64) cache.delete(cache.keys().next().value!)
    cache.set(ok, bytes)
  }
  return bytes
}

/** The image data of a PNG inflates to at most what its size allows (8 bytes a pixel, plus a filter byte a row). */
function inflatesWithin(b: Uint8Array, w: number, h: number): boolean {
  const idat: Uint8Array[] = []
  for (let o = 8; o + 8 <= b.length;) {
    const len = ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0
    const type = String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!)
    if (o + 12 + len > b.length) return false
    if (type === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len))
    if (type === 'IEND') break
    o += 12 + len
  }
  try { inflateSync(Buffer.concat(idat), { maxOutputLength: w * h * 8 + h }); return idat.length > 0 } catch { return false }
}

async function load(url: string): Promise<{ bytes: Uint8Array | null; final: boolean }> {
  try {
    const res = await fetchWithTimeout(url, { redirect: 'error' }, 5_000)
    if (!res.ok) return { bytes: null, final: res.status === 404 || res.status === 403 }
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > MAX_DOC_IMAGE_BYTES) return { bytes: null, final: true }
    const b = new Uint8Array(await res.arrayBuffer())
    if (b.byteLength > MAX_DOC_IMAGE_BYTES || imageKind(b) !== 'png') return { bytes: null, final: true }
    const size = pngSize(b)
    // A decompression bomb (a small file that inflates to gigabytes) is refused before any renderer decodes it.
    const fits = !!size && size.width > 0 && size.height > 0 && size.width <= MAX_PX && size.height <= MAX_PX && inflatesWithin(b, size.width, size.height)
    return { bytes: fits ? b : null, final: true }
  } catch (e) {
    console.error('[documents] logo', errName(e))
    return { bytes: null, final: false }
  }
}
