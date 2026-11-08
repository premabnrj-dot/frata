'use client'

import { upload } from '@vercel/blob/client'
import { MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES, widthsFor } from '@/domains/media/sizes'

// A phone photo (often 4–20 MB) is resized HERE, once, into the size ladder,
// and each size is uploaded straight to the shop's folder in Blob — so the
// server never handles the big file and nothing is resized per view (ADR-0005).

export type Uploaded = { base: string; widths: number[]; width: number; height: number }

async function toWebp(bitmap: ImageBitmap, width: number): Promise<Blob> {
  const height = Math.round((bitmap.height / bitmap.width) * width)
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  for (const q of [0.82, 0.72, 0.6]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', q))
    if (!blob) throw new Error('This browser cannot make WebP photos. Try Chrome.')
    if (blob.size <= MAX_UPLOAD_BYTES) return blob
  }
  throw new Error('That photo is too detailed to shrink under 3 MB.')
}

/** Resizes and uploads one photo; calls onProgress with 0–1. */
export async function uploadPhoto(file: File, tenantId: string, onProgress: (p: number) => void, folder: 'products' | 'theme' = 'products'): Promise<Uploaded> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) throw new Error(`${file.name} is not a photo.`)
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB.`)
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => { throw new Error(`${file.name} could not be read. Save it as JPEG and try again.`) })
  if (bitmap.width < 400) throw new Error(`${file.name} is ${bitmap.width} px wide; at least 400 px is needed.`)
  const widths = widthsFor(bitmap.width)
  const id = crypto.randomUUID()
  let base = ''
  for (const [i, w] of widths.entries()) {
    const blob = await toWebp(bitmap, w)
    const res = await upload(`tenants/${tenantId}/${folder}/${id}-${w}.webp`, blob, { access: 'public', handleUploadUrl: '/api/console/upload', contentType: 'image/webp' })
    base = res.url.replace(/-\d+\.webp$/, '')
    onProgress((i + 1) / widths.length)
  }
  const out = { base, widths, width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return out
}
