'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { pick, srcSet, urlFor } from '@/domains/media/sizes'
import { useToast } from '@/components/ui/toast'
import { attachPhotos, editPhoto } from '../actions'
import type { Uploaded } from './upload-photos'
import { uploadProblem } from './upload-problem'

export type Photo = { id: string; base: string; widths: number[]; optionValue: string | null; width: number; height: number; alt?: string }

/** Photos save as they are added (they are files, not form fields). The first is the cover; it should show the piece on a person. */
export function Photos({ productId, tenantId, photos, colours, enabled, title = '' }: { productId: string; tenantId: string; photos: Photo[]; colours: string[]; enabled: boolean; title?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<{ name: string; p: number }[]>([])
  // An upload refused or a change that failed is an error toast (§ Feedback 1); the last one stays until closed.
  const toast = useToast()
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState<string | null>(null)

  async function add(files: FileList | null) {
    if (!files?.length) return
    const list = [...files].slice(0, 12)
    setBusy(list.map((f) => ({ name: f.name, p: 0 })))
    // The resizer and uploader load only when someone adds photos (they are most of this page's script).
    const { uploadPhoto } = await import('./upload-photos')
    const done: Uploaded[] = []
    for (const [i, f] of list.entries()) {
      try { done.push(await uploadPhoto(f, tenantId, (p) => setBusy((b) => b.map((x, j) => (j === i ? { ...x, p } : x))))) }
      catch (e) {
        toast.error(uploadProblem(f.name, e))
        console.error('[photos] upload', e instanceof Error ? e.message : '')
      }
    }
    if (done.length) {
      const r = await attachPhotos(productId, done)
      if (!r.ok) toast.error(r.error)
    }
    setBusy([])
    router.refresh()
  }
  const act = (id: string, change: Parameters<typeof editPhoto>[1]) => start(async () => { const r = await editPhoto(id, change); if (!r.ok) toast.error(r.error); setConfirm(null); router.refresh() })

  return (
    <div id="photos" className="scroll-mt-20 space-y-3">
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
            {/* What the photo shows, for screen readers, Google Images and AI search (S2·6); empty = the product's title. */}
            <label htmlFor={`alt-${ph.id}`} className="sr-only">Photo {i + 1}: what it shows</label>
            <input id={`alt-${ph.id}`} defaultValue={ph.alt ?? ''} maxLength={200} disabled={pending} placeholder={`${title}${ph.optionValue ? `, ${ph.optionValue}` : ''}, photo ${i + 1}`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (ph.alt ?? '')) act(ph.id, { alt: v }) }}
              className="h-7 w-full rounded-md border border-input bg-card px-1 text-xs" />
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
            <span>{b.name.slice(0, 24)}<span className="mt-2 block h-1 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full w-full origin-left bg-ok-text transition-transform duration-base" style={{ transform: `scaleX(${b.p})` }} /></span></span>
          </div>
        ))}
        {enabled ? (
          <label className="grid h-40 w-32 cursor-pointer place-items-center rounded-sm border border-dashed border-input text-center text-sm text-muted-foreground transition-colors duration-fast hover:bg-accent">
            <span>Add photos<span className="block text-xs">JPEG, PNG or WebP</span></span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" disabled={busy.length > 0} onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
          </label>
        ) : <p className="text-sm text-muted-foreground">Photo storage is not connected on this deployment.</p>}
      </div>
    </div>
  )
}
