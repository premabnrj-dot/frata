'use client'

import { useEffect, useRef, useState } from 'react'
import { availability, type Availability } from '@/domains/catalogue/availability'
import { inches, type Chart } from '@/domains/catalogue/size-charts'
import { codFor, type DeliveryRules } from '@/domains/checkout/delivery'
import { factsOf, type ListVariant } from '@/domains/storefront/listing'
import { initialPick, isColourOption, isSizeOption, optionState, pickQuery, variantFor } from '@/domains/storefront/picker'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { Photo, type PhotoData } from './photo'
import { Swatch, type SwatchColour, type SwatchImage } from './swatch'
import { bag, openBag } from './bag-store'
import { fill } from './fill'
import type { BuyWords } from './words'

type Img = PhotoData & SwatchImage & { optionValue: string | null; alt: string }
export type BuyBoxProps = {
  title: string; options: string[]; values: string[][]; variants: (ListVariant & { id: string })[]; colours: SwatchColour[]; images: Img[]
  chart: Chart | null; model: string | null; delivery: DeliveryRules; now: string
  /** Server-written lines in the shop's words: dispatch and delivery days, the return window, the tax note. */
  notes: string[]; taxNote: string
  /** On the shop itself (the bag works); false in the console's preview. */
  live?: boolean
  /** The theme's product photos (themes T2): swipe (today) or with a thumbnail strip. */
  gallery?: 'swipe' | 'thumbs'
  /** The shop's words for this island (words.ts BUY, in the shop's language): plain strings, so nothing else ships. */
  w: BuyWords
  /** Offers that apply to this product (Offers O·2 fills it from liveOffers), after the price; display only, the quote prices. */
  offers?: OfferLine[]
}
/** One offer line as a shopper reads it: "10% off with UPI", and when it ends if it really does. */
export type OfferLine = { label: string; ends: string | null }

const money = (p: number) => formatInr(paise(p))
const TONE = { in_stock: 'text-store-good', low_stock: 'text-store-bad', sold_out: 'text-store-bad', preorder: 'text-store-ink', made_to_order: 'text-store-ink' } as const

/**
 * The product page's one client island (spec § Product page): photos of the
 * chosen colour, colour swatches with names, size buttons (sold out crossed
 * but readable), what the choice costs and when it ships, Add to bag (never
 * greyed out: it points at the missing size), and the size guide sheet the
 * phone's Back closes. A variant link (?colour=&size=) is read after load, so
 * the cached page stays one page for every shopper.
 */
export function BuyBox(p: BuyBoxProps) {
  const now = new Date(p.now)
  const [picked, setPicked] = useState<(string | null)[]>(() => initialPick(p.options, p.values, p.variants, {}, now))
  const [note, setNote] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)
  const sizesRef = useRef<HTMLFieldSetElement>(null)
  const ci = p.options.findIndex(isColourOption), si = p.options.findIndex(isSizeOption)
  const order = p.options.map((_, i) => i).sort((a, b) => Number(b === ci) - Number(a === ci))

  useEffect(() => {
    const q = Object.fromEntries(new URLSearchParams(window.location.search))
    if (Object.keys(q).length) setPicked(initialPick(p.options, p.values, p.variants, q, now))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (i: number, v: string) => {
    const next = picked.map((x, j) => (j === i ? v : x))
    setPicked(next); setNote(null)
    window.history.replaceState(window.history.state, '', window.location.pathname + pickQuery(p.options, next))
  }
  const v = variantFor(p.variants, picked)
  const a = v ? availability(factsOf(v), now) : null
  const colour = ci >= 0 ? picked[ci] : null
  const photos = colour ? [...p.images.filter((x) => x.optionValue === colour), ...p.images.filter((x) => x.optionValue !== colour)] : p.images
  const priced = p.variants.filter((x) => x.price > 0)
  const shown = v ?? (colour ? priced.find((x) => x.values[ci] === colour) : undefined) ?? priced[0]
  const cod = shown ? codFor(shown.price, p.delivery) : null

  const add = () => {
    const missing = p.options.findIndex((_, i) => picked[i] === null)
    if (missing >= 0) { setNote(fill(p.w.pick, { option: p.options[missing]!.toLowerCase() })); sizesRef.current?.querySelector('button')?.focus(); return }
    if (a && !a.canBuy) { setNote(p.w.soldOutPick); return }
    if (!p.live || !v) { setNote(p.w.preview); return }
    bag.add(v.id, 1)
    setNote(null)
    openBag()
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-10">
      <Gallery photos={photos} title={p.title} thumbs={p.gallery === 'thumbs'} w={p.w} />
      <div className="min-w-0 space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl leading-tight sm:text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{p.title}</h1>
          {shown && <p className="text-lg"><span className="font-medium">{money(shown.price)}</span>
            {shown.compareAt && shown.compareAt > shown.price && <><s className="ml-2 text-store-sub">{money(shown.compareAt)}</s><span className="ml-2 text-sm text-store-good">{fill(p.w.save, { amount: money(shown.compareAt - shown.price) })}</span></>}{shown.mrp && shown.mrp >= shown.price ? <span className="ml-2 text-xs text-store-sub">M.R.P. {money(shown.mrp)} incl. taxes</span> : null}</p>}
          {p.offers && p.offers.length > 0 && <ul className="space-y-1 text-sm text-store-sale" aria-label={p.w.offers}>{p.offers.map((o) => <li key={o.label}>{o.label}{o.ends ? ` · ${o.ends}` : ''}</li>)}</ul>}
          <p className="text-xs text-store-sub">{p.taxNote}</p>
        </div>

        {/* Colour is chosen first (it changes the photos), then size; other options after. */}
        {order.map((i) => [p.options[i]!, i] as const).map(([o, i]) => (
          <fieldset key={o} ref={i === si ? sizesRef : undefined} className="space-y-2">
            <legend className="flex w-full items-baseline justify-between text-sm">
              <span><span className="font-medium">{o}</span>{picked[i] && <span className="text-store-sub">: {picked[i]}</span>}</span>
              {i === si && p.chart && p.chart.rows.length > 0 && <button type="button" className="underline underline-offset-4" onClick={() => setGuide(true)}>{p.w.sizeGuide}</button>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {(p.values[i] ?? []).map((val) => {
                const st = optionState(p.variants, picked, i, val, now)
                const on = picked[i] === val
                if (i === ci) {
                  const c = p.colours.find((x) => x.value === val) ?? { value: val, hex: null, cropImageId: null, crop: null }
                  return (
                    <button key={val} type="button" aria-pressed={on} onClick={() => choose(i, val)} title={val}
                      className={`relative grid size-11 place-items-center rounded-full ${on ? 'ring-2 ring-store-ink ring-offset-2 ring-offset-store-paper' : ''} ${st.canBuy ? '' : 'opacity-50'}`}>
                      <Swatch c={c} images={p.images} d={36} />
                      {!st.canBuy && <span aria-hidden="true" className="absolute h-0.5 w-10 rotate-[-45deg] bg-store-ink" />}
                      <span className="sr-only">{val}{st.canBuy ? '' : p.w.soldOutSr}</span>
                    </button>
                  )
                }
                return (
                  <button key={val} type="button" aria-pressed={on} onClick={() => choose(i, val)}
                    className={`relative min-h-11 min-w-12 rounded-[var(--store-radius)] border px-3 text-sm ${on ? 'border-store-ink bg-store-ink text-store-paper' : 'border-store-line'} ${st.canBuy ? '' : 'text-store-sub line-through decoration-1'}`}>
                    {val}<span className="sr-only">{st.canBuy ? '' : p.w.soldOutSr}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        <p role="status" className={`min-h-5 text-sm ${a ? TONE[a.kind] : 'text-store-sub'}`}>{a ? labelOf(a, p.w) : p.options.length ? fill(p.w.pickToSee, { option: p.options.find((_, i) => picked[i] === null)?.toLowerCase() ?? p.w.size.toLowerCase() }) : ''}</p>
        <button type="button" onClick={add} className="store-btn h-12 w-full rounded-[var(--store-radius)] transition-transform duration-fast ease-standard active:scale-97 bg-store-button text-base font-medium text-store-on-button">{a?.kind === 'preorder' ? p.w.preorder : p.w.addToBag}</button>
        {note && <p role="alert" className="text-sm">{note}</p>}

        <ul className="space-y-1.5 border-t border-store-line pt-4 text-sm">
          {cod?.offered && <li>{p.w.cod}{cod.charge > 0 ? fill(p.w.codExtra, { fee: money(cod.charge) }) : ''}</li>}
          {shown && <li>{deliveryLine(shown.price, p.delivery, p.w)}</li>}
          {p.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        {p.model && <p className="text-sm text-store-sub">{p.model}</p>}
      </div>
      {guide && p.chart && <SizeGuide chart={p.chart} model={p.model} w={p.w} onClose={() => setGuide(false)} />}
    </div>
  )
}

function deliveryLine(price: number, d: DeliveryRules, w: BuyWords) {
  if (!d.shippingFlat) return w.freeAll
  if (d.freeShippingAbove && price >= d.freeShippingAbove) return w.freeDelivery
  return fill(w.delivery, { flat: money(d.shippingFlat) }) + (d.freeShippingAbove ? fill(w.deliveryFreeAbove, { above: money(d.freeShippingAbove) }) : '')
}

/** What the chosen variant's availability says, in the shop's words (availability() gives the kind and its data). */
function labelOf(a: Availability, w: BuyWords): string {
  switch (a.kind) {
    case 'in_stock': return w.inStock
    case 'low_stock': return fill(w.lowStock, { n: a.left })
    case 'preorder': return fill(w.preorderBy, { date: new Date(`${a.shipsBy}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) })
    case 'made_to_order': return fill(w.madeToOrder, { a: a.leadDays[0], b: a.leadDays[1] })
    case 'sold_out': return w.soldOut
  }
}

/**
 * Photos side by side, swiped on a phone (scroll-snap), stacked on a desktop. The first is the page's largest paint.
 * With thumbnails (themes T2): one photo at a time at every width, a strip of buttons under it.
 */
function Gallery({ photos, title, thumbs = false, w }: { photos: Img[]; title: string; thumbs?: boolean; w: BuyWords }) {
  const [at, setAt] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  if (!photos.length) return <div className="grid aspect-[4/5] place-items-center rounded-sm bg-store-chip text-store-sub">{title}</div>
  const show = (i: number) => { const el = list.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }); setAt(i) }
  return (
    <div className="min-w-0">
      <ul ref={list} className={thumbs ? '-mx-4 flex snap-x snap-mandatory overflow-x-auto md:mx-0 [&::-webkit-scrollbar]:hidden' : '-mx-4 flex snap-x snap-mandatory overflow-x-auto md:mx-0 md:grid md:grid-cols-2 md:gap-2 md:overflow-visible [&::-webkit-scrollbar]:hidden'}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} aria-label={w.photos}>
        {photos.map((ph, i) => (
          <li key={ph.base} className={thumbs ? 'w-full shrink-0 snap-center' : `w-full shrink-0 snap-center md:w-auto ${i === 0 ? 'md:col-span-2' : ''}`}>
            <Photo p={ph} alt={ph.alt || (i === 0 ? title : fill(w.photoAlt, { title, i: i + 1 }))} sizes="(min-width: 768px) 55vw, 100vw" priority={i === 0} className="aspect-[4/5] w-full bg-store-chip object-cover" />
          </li>
        ))}
      </ul>
      {thumbs && photos.length > 1
        ? <ul className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={w.choosePhoto}>
            {photos.map((ph, i) => (
              <li key={ph.base} className="shrink-0">
                <button type="button" onClick={() => show(i)} aria-label={fill(w.photoOf, { i: i + 1, n: photos.length })} aria-current={at === i ? 'true' : undefined}
                  className={`block w-14 overflow-hidden rounded-[var(--store-radius)] ${at === i ? 'ring-2 ring-store-ink' : ''}`}>
                  <Photo p={ph} alt="" sizes="56px" className="aspect-[4/5] w-full bg-store-chip object-cover" />
                </button>
              </li>
            ))}
          </ul>
        : photos.length > 1 && <p className="mt-2 text-center text-xs text-store-sub md:hidden" aria-hidden="true">{at + 1} / {photos.length}</p>}
    </div>
  )
}

/** A sheet over the page; it is a history entry, so the phone's Back closes it. */
function SizeGuide({ chart, model, onClose, w }: { chart: Chart; model: string | null; onClose: () => void; w: BuyWords }) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [unit, setUnit] = useState<'cm' | 'in'>('cm')
  // Once per opening: the sheet is a history entry, so Back closes it.
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
    window.history.pushState({ ...window.history.state, sizeGuide: true }, '')
    const back = () => closeRef.current()
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [])
  const close = () => { if (window.history.state?.sizeGuide) window.history.back(); else onClose() }
  return (
    <dialog ref={ref} data-store-drawer="sheet" onCancel={(e) => { e.preventDefault(); close() }} aria-labelledby="sg-h"
      className="m-0 mt-auto w-full max-w-none rounded-t-md bg-store-paper p-0 text-store-ink sm:m-auto sm:max-w-lg sm:rounded-md">
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 id="sg-h" className="text-lg font-medium">{w.sizeGuide}</h2>
          <button type="button" onClick={close} className="grid size-11 place-items-center text-xl" aria-label={w.closeGuide}>×</button>
        </div>
        <div className="flex gap-1 text-sm" role="group" aria-label={w.units}>
          {(['cm', 'in'] as const).map((u) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`rounded-sm border px-3 py-1.5 ${unit === u ? 'border-store-ink bg-store-ink text-store-paper' : 'border-store-line'}`}>{u === 'cm' ? w.cm : w.inches}</button>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-store-line text-left"><th className="py-2 pr-3 font-medium">{w.size}</th>{chart.columns.map((c) => <th key={c} className="py-2 pr-3 font-medium">{c}</th>)}</tr></thead>
            <tbody>{chart.rows.map((r) => <tr key={r.size} className="border-b border-store-line/60"><td className="py-2 pr-3 font-medium">{r.size}</td>{r.values.map((x, i) => <td key={i} className="py-2 pr-3 tabular-nums">{x === null ? '—' : unit === 'cm' ? x : inches(x)}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {chart.howToMeasure && <p className="text-sm text-store-sub">{chart.howToMeasure}</p>}
        {model && <p className="text-sm">{model}</p>}
      </div>
    </dialog>
  )
}
