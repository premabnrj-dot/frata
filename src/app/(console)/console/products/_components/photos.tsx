'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { pick, srcSet, urlFor } from '@/domains/media/sizes'
import { attachPhotos, editPhoto } from '../actions'
import type { Uploaded } from './upload-photos'

export type Photo = { id: string; base: string; widths: number[]; optionValue: string | null; width: number; height: number }

/** Photos save as they are added (they are files, not form fields). The first is the cover; it should show the piece on a person. */
export function Photos({ productId, tenantId, photos, colours, enabled }: { productId: string; tenantId: string; photos: Photo[]; colours: string[]; enabled: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<{ name: string; p: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState<string | null>(null)

  async function add(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    const list = [...files].slice(0, 12)
    setBusy(list.map((f) => ({ name: f.name, p: 0 })))
    // The resizer and uploader load only when someone adds photos (they are most of this page's script).
    const { uploadPhoto } = await import('./upload-photos')
    const done: Uploaded[] = []
    for (const [i, f] of list.entries()) {
      try { done.push(await uploadPhoto(f, tenantId, (p) => setBusy((b) => b.map((x, j) => (j === i ? { ...x, p } : x))))) }
      catch (e) {
        const m = e instanceof Error ? e.message : ''
        // Say what is wrong in words; the storage service's own messages are for us, not the merchant.
        setError(/private/i.test(m) ? 'Photo storage is set to private, so shoppers could not see these photos. Frata support needs to switch it to a public store.'
          : /network|fetch|failed to fetch/i.test(m) ? `${f.name} did not upload: the connection dropped. Try again.`
          : m.startsWith('Vercel Blob') ? `${f.name} was refused by photo storage. Try again, or send us this: ${m.replace(/^Vercel Blob:\s*/, '').slice(0, 120)}`
          : m || `${f.name} could not be uploaded.`)
        console.error('[photos] upload', m)
      }
    }
    if (done.length) {
      const r = await attachPhotos(productId, done)
      if (!r.ok) setError(r.error)
    }
    setBusy([])
    router.refresh()
  }
  const act = (id: string, change: Parameters<typeof editPhoto>[1]) => start(async () => { const r = await editPhoto(id, change); if (!r.ok) setError(r.error); setConfirm(null); router.refresh() })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {photos.map((ph, i) => (
          <figure key={ph.id} className="w-32 space-y-1">
            <div className="relative">
              <img src={urlFor(ph.base, pick(ph.widths, 256))} srcSet={srcSet(ph.base, ph.widths)} sizes="128px" alt="" width={128} height={160} className="h-40 w-32 rounded-sm bg-muted object-cover" />
              {i === 0 && <span className="absolute bottom-1 left-1 rounded-sm bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">Cover</span>}
            </div>
            <div className="flex items-center justify-between text-xs">
              <button type="button" disabled={i === 0 || pending} aria-label="Move earlier" className="inline-grid min-h-6 min-w-6 place-items-center disabled:opacity-30" onClick={() => act(ph.id, { move: -1 })}>←</button>
              {confirm === ph.id
                ? <span className="flex gap-1"><button type="button" className="inline-flex min-h-6 items-center text-danger-text underline" onClick={() => act(ph.id, { remove: true })}>Remove</button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setConfirm(null)}>Keep</button></span>
                : <button type="button" className="inline-flex min-h-6 items-center text-muted-foreground underline" onClick={() => setConfirm(ph.id)}>Remove</button>}
              <button type="button" disabled={i === photos.length - 1 || pending} aria-label="Move later" className="inline-grid min-h-6 min-w-6 place-items-center disabled:opacity-30" onClick={() => act(ph.id, { move: 1 })}>→</button>
            </div>
            {colours.length > 0 && (
              <select aria-label="Which colour this photo shows" value={ph.optionValue ?? ''} disabled={pending} onChange={(e) => act(ph.id, { optionValue: e.target.value || null })}
                className="h-7 w-full rounded-md border border-input bg-card px-1 text-xs">
                <option value="">Every colour</option>{colours.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </figure>
        ))}
        {busy.map((b) => (
          <div key={b.name} className="grid h-40 w-32 place-items-center rounded-sm border border-dashed border-input p-2 text-center text-xs text-muted-foreground">
            <span>{b.name.slice(0, 24)}<span className="mt-2 block h-1 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-ok-text transition-[width] duration-base" style={{ width: `${b.p * 100}%` }} /></span></span>
          </div>
        ))}
        {enabled ? (
          <label className="grid h-40 w-32 cursor-pointer place-items-center rounded-sm border border-dashed border-input text-center text-sm text-muted-foreground transition-colors duration-fast hover:bg-accent">
            <span>Add photos<span className="block text-xs">JPEG, PNG or WebP</span></span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" disabled={busy.length > 0} onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
          </label>
        ) : <p className="text-sm text-muted-foreground">Photo storage is not connected on this deployment.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      <p className="text-xs text-muted-foreground">Photos are resized on your phone or computer before they upload, so a large photo is fine. The first is the cover: show the piece on a person.</p>
    </div>
  )
}
