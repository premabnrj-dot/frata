'use client'

import { photoUploadProblem } from '../../_components/upload-problem'
import { addPhotos } from '../actions'

// The Photos page's sending: each product's photos are resized and uploaded one after another (as the editor does,
// through upload-photos.ts, into the import bucket), then attached in one call, in their places; a few products at
// a time. A photo that fails is told and left for Try again; its product's photos that did upload are HELD (kept, not
// attached) until it uploads too, so the product's photos are attached in their places: photo 1 stays the cover.

export type Made = { base: string; widths: number[]; width: number; height: number }
export type Batch = { productId: string; photos: { key: string; file: File; colour: string | null; made: Made | null }[] }
export type Told = {
  progress: (key: string, p: number) => void
  added: (productId: string, keys: string[]) => void
  held: (key: string, made: Made) => void
  /** `made`: the photo uploaded but its attach failed: kept, so Try again sends the same file (attachIn skips one it has). */
  failed: (key: string, why: string, made?: Made) => void
}

/** Photos resized at once: a phone has little memory (a 12-megapixel photo is ~48 MB as pixels). */
const lanes = () => (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 4) >= 8 ? 3 : 2)

export async function sendPhotos(batches: Batch[], tenantId: string, told: Told): Promise<void> {
  // The resizer and uploader load only when photos are sent.
  const { uploadPhoto } = await import('../../_components/upload-photos')
  const queue = [...batches]
  async function lane() {
    for (let b = queue.shift(); b; b = queue.shift()) {
      const made: { key: string; photo: Made & { colour: string | null } }[] = []
      let failed = false
      for (const ph of b.photos) {
        try {
          const u = ph.made ?? await uploadPhoto(ph.file, tenantId, (p) => told.progress(ph.key, p), 'products', '/api/console/upload/import')
          made.push({ key: ph.key, photo: { base: u.base, widths: u.widths, width: u.width, height: u.height, colour: ph.colour } })
        } catch (e) {
          failed = true
          console.error('[photos page] upload', e instanceof Error ? e.message : '')
          told.failed(ph.key, photoUploadProblem(ph.file.name, e))
        }
      }
      if (failed) { for (const m of made) told.held(m.key, m.photo); continue }
      const r = await addPhotos({ productId: b.productId, photos: made.map((m) => m.photo) }).catch(() => ({ ok: false as const, error: 'We could not add the photos. Try again.' }))
      if (r.ok) told.added(b.productId, made.map((m) => m.key))
      else for (const m of made) told.failed(m.key, r.error, m.photo)
    }
  }
  await Promise.all(Array.from({ length: lanes() }, lane))
}
