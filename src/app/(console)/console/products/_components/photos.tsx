'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { pick, srcSet, urlFor } from '@/domains/media/sizes'
import { useToast } from '@/components/ui/toast'
import { Tag } from '@/components/ui/badge'
import { Menu } from '@/components/ui/menu'
import { ConfirmDelete } from '@/components/ui/confirm-delete'
import { moved, useReorder } from '@/components/ui/sortable'
import { MoreHorizontal } from 'lucide-react'
import { attachPhotos, editPhoto } from '../actions'
import type { Uploaded } from './upload-photos'
import { photoUploadProblem } from './upload-problem'

export type Photo = { id: string; base: string; widths: number[]; optionValue: string | null; width: number; height: number; alt?: string }

/** Photos save as they are added (they are files, not form fields). The first is the cover; it should show the piece on a
 *  person. Drag a photo (a finger or a mouse) or use its menu to move it (Neel N2, as drawn); the new order shows at once and
 *  is saved behind it (refreshed from the server, or put back with a toast if the save fails). */
export function Photos({ productId, tenantId, photos, colours, enabled, title = '' }: { productId: string; tenantId: string; photos: Photo[]; colours: string[]; enabled: boolean; title?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<{ name: string; p: number }[]>([])
  // An upload refused or a change that failed is an error toast (§ Feedback 1); the last one stays until closed.
  const toast = useToast()
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState<string | null>(null)
  // The order on screen: moved at once on a drop, then the server's after the refresh.
  const [order, setOrder] = useState(photos)
  useEffect(() => { setOrder(photos) }, [photos])
  const moveTo = (from: number, to: number) => {
    const ph = order[from]
    if (!ph || to === from) return
    setOrder((o) => moved(o, from, to))
    start(async () => { const r = await editPhoto(ph.id, { move: { to } }); if (!r.ok) { toast.error(r.error); setOrder(photos) } router.refresh() })
  }
  const { itemProps } = useReorder(order.length, moveTo)

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
        toast.error(photoUploadProblem(f.name, e))
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
  const removing = order.find((x) => x.id === confirm)

  return (
    <div id="photos" className="scroll-mt-20 space-y-3">
      <div data-sortable="" className="flex flex-wrap gap-3">
        {order.map((ph, i) => (
          <figure key={ph.id} className="w-32 space-y-1">
            <div className="relative">
              {/* The photo is the handle: drag it, or focus it and Alt+← →. */}
              <button type="button" aria-label={`Photo ${i + 1} of ${order.length}${i === 0 ? ', the cover' : ''}`} {...itemProps(i, `Photo ${i + 1}`)}
                className="block cursor-grab touch-none rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                <img src={urlFor(ph.base, pick(ph.widths, 256))} srcSet={srcSet(ph.base, ph.widths)} sizes="128px" alt="" width={128} height={160} draggable={false} className="h-40 w-32 rounded-md bg-sunk object-cover" />
              </button>
              {i === 0 && <Tag className="absolute top-1.5 left-1.5">Cover</Tag>}
              <span className="absolute top-1 right-1 rounded-sm bg-card/90">
                <Menu label={`Photo ${i + 1} of ${order.length}`} icon={<MoreHorizontal aria-hidden="true" className="size-4" />} items={[
                  ...(i > 0 ? [{ label: 'Make cover', onSelect: () => moveTo(i, 0) }, { label: 'Move earlier', onSelect: () => moveTo(i, i - 1) }] : []),
                  ...(i < order.length - 1 ? [{ label: 'Move later', onSelect: () => moveTo(i, i + 1) }] : []),
                  { label: 'Remove', danger: true, onSelect: () => setConfirm(ph.id) },
                ]} />
              </span>
            </div>
            {/* What the photo shows, for screen readers, Google Images and AI search (S2·6); empty = the product's title. */}
            <label htmlFor={`alt-${ph.id}`} className="sr-only">Photo {i + 1}: what it shows</label>
            <input id={`alt-${ph.id}`} defaultValue={ph.alt ?? ''} maxLength={200} disabled={pending} placeholder={`${title}${ph.optionValue ? `, ${ph.optionValue}` : ''}, photo ${i + 1}`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (ph.alt ?? '')) act(ph.id, { alt: v }) }}
              className="h-11 w-full rounded-md border border-input bg-card px-1.5 text-xs md:h-7" />
            {colours.length > 0 && (
              <select aria-label="Which colour this photo shows" value={ph.optionValue ?? ''} disabled={pending} onChange={(e) => act(ph.id, { optionValue: e.target.value || null })}
                className="h-11 w-full rounded-md border border-input bg-card px-1 text-xs md:h-7">
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
          <label className="grid h-40 w-32 cursor-pointer place-items-center rounded-md border border-dashed border-input text-center text-sm text-muted-foreground transition-colors duration-fast hover:bg-accent focus-within:outline-2 focus-within:outline-ring">
            <span>+ Add<span className="block text-xs">JPEG, PNG or WebP</span></span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" disabled={busy.length > 0} onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
          </label>
        ) : <p className="text-sm text-muted-foreground">Photo storage is not connected on this deployment.</p>}
      </div>
      <ConfirmDelete open={!!removing} count={1} noun={['photo', 'photos']} verb="Remove" keep="Keep it" busy={pending}
        consequence={<>It comes off this product and your shop.</>} onClose={() => setConfirm(null)} onConfirm={() => removing && act(removing.id, { remove: true })} />
    </div>
  )
}
