'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { firstProductShape } from '@/domains/catalogue/first-product'
import { urlFor } from '@/domains/media/sizes'
import { cn } from '@/lib/utils'
import { addFirstProduct, loadFirstProduct } from '../../products/first-product-actions'
import type { FirstProductForm } from '@/lib/queries/catalogue'
import type { PopupProps, ProductDraft } from './drafts'
// Static here: the popups' chunk loads on first open already; a second import() would be one more entry in every console
// page's script loader.
import { uploadPhoto } from '../../products/_components/upload-photos'

// "Add your first product" (mockup § 2 `#ov-product`, O2a·7): a photo, the name, the price, the stock, the sizes the
// name implies (firstProductShape, the rule the server reads). "Add product" asks for Active; it stays a draft, with
// what it still needs, when readiness says so. "Add more details" saves a draft and opens the editor.

const LABEL = 'text-label font-medium'

export function FirstProduct({ open, draft, setDraft, onClose, onSaved, tenantId }: PopupProps<ProductDraft> & { tenantId: string }) {
  const router = useRouter()
  const [form, setForm] = useState<FirstProductForm | null>(null)
  const [busy, setBusy] = useState<'add' | 'more' | 'photo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needs, setNeeds] = useState<string[] | null>(null)
  // Kept a draft: it is saved, so pressing again opens its editor (where what it needs is fixed), never a second copy.
  const [kept, setKept] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open || form) return
    loadFirstProduct().then((r) => (r.ok ? setForm(r) : setError(r.error)), () => setError('We couldn’t reach Frrata. Try again.'))
  }, [open, form])
  const shape = firstProductShape(draft.title, form?.types ?? [], form?.sells ?? [])
  const pressed = draft.sizes ?? shape.pressed
  const set = (p: Partial<ProductDraft>) => setDraft({ ...draft, ...p })
  const toggle = (s: string) => set({ sizes: pressed.includes(s) ? pressed.filter((x) => x !== s) : shape.options.filter((o) => o === s || pressed.includes(o)) })

  const pick = async (f: File | undefined) => {
    if (!f) return
    setBusy('photo'); setError(null)
    try {
      set({ photo: await uploadPhoto(f, tenantId, () => {}) })
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'We couldn’t add the photo. Try again.')
    } finally { setBusy(null) }
  }
  const editor = (handle: string) => { onSaved(''); router.push(`/console/products/${encodeURIComponent(handle)}`) }
  const send = async (activate: boolean) => {
    if (kept) { editor(kept); return }
    setBusy(activate ? 'add' : 'more'); setError(null); setNeeds(null); setErrors({})
    try {
      const r = await addFirstProduct({ title: draft.title, price: draft.price, stock: draft.stock, sizes: shape.sized ? pressed : [], photos: draft.photo ? [draft.photo] : [] }, activate)
      if (!r.ok) { setError(r.errors ? null : r.error); setErrors(r.errors ?? {}); return }
      if (!activate) { editor(r.handle); return }
      if (r.status === 'draft') { setNeeds(r.needs ?? []); setKept(r.handle); return }
      onSaved(`Added ${draft.title.trim().replace(/\s+/g, ' ')}.`)
    } catch {
      setError('We couldn’t add the product. Nothing was saved.')
    } finally { setBusy(null) }
  }
  const more = () => { if (draft.title.trim()) void send(false); else { onClose(); router.push('/console/products') } }

  return (
    <Dialog open={open} onClose={onClose} onDismiss={onClose} title="Add your first product"
      error={needs ? <><b className="font-semibold">Saved as a draft.</b><ul className="list-disc pl-5">{needs.map((n) => <li key={n}>{n[0]!.toUpperCase() + n.slice(1)}</li>)}</ul></> : error}
      actions={<><Button variant="ghost" busy={busy === 'more'} onClick={more}>Add more details</Button><Button busy={busy === 'add'} onClick={() => void send(true)}>Add product</Button></>}>
      <div className="grid gap-3">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => file.current?.click()} aria-label={draft.photo ? 'Photo added. Change photo' : 'Add a photo'} aria-busy={busy === 'photo' || undefined}
            className={cn('grid aspect-square w-23 shrink-0 place-items-center overflow-hidden rounded-[10px] border-[1.5px] text-text-3', draft.photo ? 'border-solid border-edge' : 'border-dashed border-edge bg-sunk')}>
            {draft.photo ? <img src={urlFor(draft.photo.base, 400)} alt="" className="size-full object-cover" />
              : <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>}
          </button>
          <input ref={file} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
          <div className="grid min-w-0 flex-1 gap-2.5">
            <label className="grid gap-1.5"><span className={LABEL}>Name</span>
              <input data-autofocus className={`${FIELD} w-full`} value={draft.title} maxLength={140} onChange={(e) => set({ title: e.target.value })} {...fieldProps('fp-title', errors.title)} />
              <FieldError name="fp-title" message={errors.title} /></label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="grid min-w-0 gap-1.5"><span className={LABEL}>Price</span>
                <input className={`${FIELD} w-full font-num`} inputMode="numeric" value={draft.price} onChange={(e) => set({ price: e.target.value })} {...fieldProps('fp-price', errors.price)} />
                <FieldError name="fp-price" message={errors.price} /></label>
              <label className="grid min-w-0 gap-1.5"><span className={LABEL}>{shape.sized ? 'In stock, each size' : 'In stock'}</span>
                <input className={`${FIELD} w-full font-num`} inputMode="numeric" value={draft.stock} onChange={(e) => set({ stock: e.target.value })} {...fieldProps('fp-stock', errors.stock)} />
                <FieldError name="fp-stock" message={errors.stock} /></label>
            </div>
          </div>
        </div>
        {shape.sized && (
          <div className="grid gap-1.5">
            <span className={LABEL} id="fp-sizes">Sizes</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="fp-sizes">
              {shape.options.map((o) => (
                <button key={o} type="button" aria-pressed={pressed.includes(o)} onClick={() => toggle(o)}
                  className="min-h-8 rounded-full border border-edge bg-card px-3 text-label aria-pressed:border-primary aria-pressed:bg-select aria-pressed:font-medium aria-pressed:text-link">{o}</button>
              ))}
            </div>
            <FieldError name="fp-sizes" message={errors.sizes} />
          </div>
        )}
      </div>
    </Dialog>
  )
}
