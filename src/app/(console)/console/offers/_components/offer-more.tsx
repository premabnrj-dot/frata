'use client'

import { useState } from 'react'
import type { OfferValues } from '@/domains/checkout/offer-form'
import { InfoTip } from '@/components/ui/info-tip'
import { FieldError, errorId, fieldProps } from '@/components/ui/field-error'
import { FIELD } from '@/components/ui/field'

// =============================================================================
// THE O·2 PARTS OF THE OFFER FORM (docs/plans/2026-11-08-offers-o2.md): what a product offer covers, Buy X get Y, the
// free gift, tiers and first order. Plain fields; the action parses them with parseOffer().
// =============================================================================

export type Pickers = { products: { id: string; title: string }[]; collections: { id: string; title: string }[]; pieces: { id: string; title: string }[] }

const field = `${FIELD} w-full`
const lab = 'block text-sm font-medium'

export function OfferMore({ v, set, errors, pickers }: { v: OfferValues; set: (p: Partial<OfferValues>) => void; errors: Record<string, string>; pickers: Pickers }) {
  const err = (k: string) => <FieldError name={`o-${k}`} message={errors[k]} />
  const fp = (k: string) => fieldProps(`o-${k}`, errors[k])
  const [q, setQ] = useState('')
  const style = v.style
  const covers = style === 'product_off' || style === 'bxgy'
  const list = v.targets === 'collections' ? pickers.collections : pickers.products
  const picked = new Set(v.targetIds ?? [])
  const found = list.filter((x) => !q.trim() || x.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50)
  const tiers = v.tiers ?? []
  return (
    <>
      {style === 'bxgy' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1"><label htmlFor="o-buy" className={lab}>Buy</label>
            <input id="o-buy" inputMode="numeric" value={v.buyQty ?? ''} {...fp('buyQty')} onChange={(e) => set({ buyQty: e.target.value })} className={field} />{err('buyQty')}</div>
          <div className="space-y-1"><label htmlFor="o-get" className={lab}>Get</label>
            <input id="o-get" inputMode="numeric" value={v.getQty ?? ''} {...fp('getQty')} onChange={(e) => set({ getQty: e.target.value })} className={field} />{err('getQty')}</div>
          <div className="space-y-1"><label htmlFor="o-getpct" className={lab}>% off them <span className="font-normal text-muted-foreground">(100 = free)</span></label>
            <input id="o-getpct" inputMode="numeric" value={v.getPct ?? ''} {...fp('getPct')} onChange={(e) => set({ getPct: e.target.value })} className={field} />{err('getPct')}</div>
          <p className="col-span-3 text-xs text-muted-foreground">The cheapest pieces of each group are the ones discounted. On the invoice the saving is shared over the group&apos;s pieces.</p>
        </div>
      )}
      {style === 'free_gift' && (
        <div className="space-y-1"><label htmlFor="o-gift" className={lab}>The free piece</label>
          <select id="o-gift" value={v.giftVariantId ?? ''} {...fp('giftVariantId')} aria-describedby={errors.giftVariantId ? errorId('o-giftVariantId') : 'o-gift-hint'} onChange={(e) => set({ giftVariantId: e.target.value })} className={field}>
            <option value="">Choose…</option>{pickers.pieces.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
          {errors.giftVariantId ? err('giftVariantId') : <p id="o-gift-hint" className="text-xs text-muted-foreground">Shoppers add it themselves when the rest of the bag reaches the amount below. It is billed at ₹0; your CA may ask you to reverse input credit on gifted stock.</p>}
        </div>
      )}
      {covers && (
        <fieldset className="space-y-2"><legend className={lab}>Covers</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {([['all', 'Every product'], ['products', 'Chosen products'], ['collections', 'Chosen collections']] as const).map(([k, l]) => (
              <label key={k} className="flex min-h-6 items-center gap-2"><input type="radio" name="targets" className="size-5 accent-primary" checked={(v.targets ?? 'all') === k} onChange={() => set({ targets: k, targetIds: [] })} />{l}</label>
            ))}
          </div>
          {(v.targets ?? 'all') !== 'all' && (
            <div className="space-y-2">
              <label htmlFor="o-find" className="sr-only">Find</label>
              <input id="o-find" value={q} {...fp('targets')} placeholder={v.targets === 'collections' ? 'Find a collection' : 'Find a product'} onChange={(e) => setQ(e.target.value)} className={field} />
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border" aria-label="Choose">
                {found.map((x) => (
                  <li key={x.id}><label className="flex min-h-9 items-center gap-2 px-3 text-sm"><input type="checkbox" className="shrink-0" checked={picked.has(x.id)}
                    onChange={(e) => set({ targetIds: e.target.checked ? [...picked, x.id] : [...picked].filter((y) => y !== x.id) })} />{x.title}</label></li>
                ))}
                {!found.length && <li className="px-3 py-2 text-sm text-muted-foreground">Nothing matches.</li>}
              </ul>
              <p className="text-xs text-muted-foreground">{picked.size} chosen{v.targets === 'collections' ? '. A rule collection brings its products as they change.' : ''}</p>{err('targets')}
            </div>
          )}
        </fieldset>
      )}
      {style === 'order_off' && (
        <fieldset className="space-y-2"><legend className={lab}>Steps <span className="font-normal text-muted-foreground">(optional)</span><InfoTip about="steps">More off for bigger bags. With steps, the value above is not used.</InfoTip></legend>
          {tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <div className="space-y-1"><label htmlFor={`o-tmin-${i}`} className="text-xs">From ₹</label>
                <input id={`o-tmin-${i}`} inputMode="decimal" value={t.min} {...(i === 0 && errors.tiers && !errors[`tier${i}`] ? fp('tiers') : fp(`tier${i}`))} onChange={(e) => set({ tiers: tiers.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)) })} className={field} /></div>
              <div className="space-y-1"><label htmlFor={`o-tval-${i}`} className="text-xs">{v.kind === 'percent' ? '% off' : '₹ off'}</label>
                <input id={`o-tval-${i}`} inputMode="decimal" value={t.value} {...fp(`tier${i}`)} onChange={(e) => set({ tiers: tiers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} className={field} /></div>
              <button type="button" className="min-h-9 px-2 text-sm underline" onClick={() => set({ tiers: tiers.filter((_, j) => j !== i) })}>Remove</button>
              <FieldError name={`o-tier${i}`} message={errors[`tier${i}`]} className="col-span-3" />
            </div>
          ))}
          {tiers.length < 4 && <button type="button" className="min-h-9 text-sm underline" onClick={() => set({ tiers: [...tiers, { min: '', value: '' }] })}>Add a step</button>}
          {err('tiers')}
          <label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" className="shrink-0" checked={!!v.firstOrder} onChange={(e) => set({ firstOrder: e.target.checked })} />Only for a shopper&apos;s first order here (checked by phone when they order)</label>
        </fieldset>
      )}
    </>
  )
}
