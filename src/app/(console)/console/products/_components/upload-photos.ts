'use client'

import { upload } from '@vercel/blob/client'
import { baseFromUpload, blobPath, contentTypeOf, MAX_SOURCE_BYTES, type PhotoFormat, widthsFor } from '@/domains/media/sizes'
import { maxBytesFor } from '@/domains/media/upload-limits'

// A phone photo (often 4–20 MB) is resized HERE, once, into the size ladder,
// and each size is uploaded straight to the shop's folder in Blob — so the
// server never handles the big file and nothing is resized per view (ADR-0005).
// WebP where the browser really makes it. Safari on an iPhone answers 'image/webp' with a PNG (or nothing), so there
// the photo is JPEG, every size of it: one format per photo, said by its base (domains/media/sizes.ts).

export type Uploaded = { base: string; widths: number[]; width: number; height: number }

const QUALITIES = [0.82, 0.72, 0.6]
const encode = (canvas: HTMLCanvasElement, format: PhotoFormat, q: number) =>
  new Promise<Blob | null>((r) => canvas.toBlob(r, contentTypeOf(format), q))

/** One size of the photo in `format`; with none chosen yet (the first size), WebP if the browser made one, else JPEG. */
async function sized(bitmap: ImageBitmap, width: number, format: PhotoFormat | null): Promise<{ blob: Blob; format: PhotoFormat }> {
  const height = Math.round((bitmap.height / bitmap.width) * width)
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  let f = format
  if (!f) {
    // The blob's own type, not just a blob: Safari returns a PNG for 'image/webp'.
    const probe = await encode(canvas, 'webp', QUALITIES[0]!)
    f = probe?.type === 'image/webp' ? 'webp' : 'jpeg'
    if (probe && f === 'webp' && probe.size <= maxBytesFor(width)) return { blob: probe, format: f }
  }
  // JPEG has no transparency: the browser would put a transparent logo on black. White goes behind it instead
  // (impact review 2026-11-12: Safari logos came out as a black box).
  if (f === 'jpeg') { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height) }
  for (const q of QUALITIES) {
    const blob = await encode(canvas, f, q)
    if (!blob || blob.type !== contentTypeOf(f)) throw new Error('This browser could not make the photo. Try another browser.')
    if (blob.size <= maxBytesFor(width)) return { blob, format: f }
  }
  throw new Error(`That photo is too detailed to shrink under ${Math.round(maxBytesFor(width) / 1024)} kB at ${width} px wide.`)
}

/** Resizes and uploads one photo; calls onProgress with 0–1. `via`: the token route (the Photos page: the import bucket). */
export async function uploadPhoto(file: File, tenantId: string, onProgress: (p: number) => void, folder: 'products' | 'theme' | 'brand' = 'products', via = '/api/console/upload'): Promise<Uploaded> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) throw new Error(`${file.name} is not a photo.`)
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB.`)
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => { throw new Error(`${file.name} could not be read. Save it as JPEG and try again.`) })
  // A logo may be small (drawn at 400 wide); a photo needs 400 px of its own.
  if (bitmap.width < (folder === 'brand' ? 120 : 400)) throw new Error(`${file.name} is ${bitmap.width} px wide; at least ${folder === 'brand' ? 120 : 400} px is needed.`)
  const widths = widthsFor(bitmap.width)
  const id = crypto.randomUUID()
  let base = '', format: PhotoFormat | null = null
  for (const [i, w] of widths.entries()) {
    const made = await sized(bitmap, w, format)
    format = made.format
    const res = await upload(blobPath(tenantId, folder, id, w, format), made.blob, { access: 'public', handleUploadUrl: via, contentType: contentTypeOf(format) })
    base = baseFromUpload(res.url, format)
    onProgress((i + 1) / widths.length)
  }
  const out = { base, widths, width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return out
}
