'use client'

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { CloseMark } from './close-mark'
// The PIN code check is its own chunk: below the buy box, not needed for the first paint (product page JS budget).
const DeliveryCheck = lazy(() => import('./delivery-check').then((m) => ({ default: m.DeliveryCheck })))

type Gallery = 'swipe' | 'thumbs' | 'rail' | 'stack'
type Img = PhotoData & SwatchImage & { optionValue: string | null; alt: string }
export type BuyBoxProps = {
  title: string; options: string[]; values: string[][]; variants: (ListVariant & { id: string })[]; colours: SwatchColour[]; images: Img[]
  chart: Chart | null; model: string | null; delivery: DeliveryRules; now: string
  /** Delivery Zones usable: delivery and pay on delivery depend on the PIN code, so only the check states them. */
  zoned?: boolean
  /** Server-written lines in the shop's words: dispatch and delivery days, the return window, the tax note. */
  notes: string[]; taxNote: string
  /** On the shop itself (the bag works); false in the console's preview. */
  live?: boolean
  /** The theme's product photos (themes T2; rail and stack 2.0): swipe (today), a thumbnail strip, a thumbnail column beside, every photo stacked. */
  gallery?: Gallery
  /** 2.0: on a computer the buy box stays beside the photos as they scroll. */
  stickyBox?: boolean
  /** 2.0: on a phone, an Add to bag bar at the bottom once the page's own button has scrolled away; `aboveTabs` lifts it over the bottom tabs. */
  buyBar?: boolean; aboveTabs?: boolean
  /** The shop's words for this island (words.ts BUY, in the shop's language): plain strings, so nothing else ships. */
  w: BuyWords
  /** Offers that apply to this product (Offers O·2 fills it from liveOffers), after the price; display only, the quote prices. */
  offers?: OfferLine[]
  /** Signal S3: server-drawn slots — stories under the photos (a stacked gallery), "Pair it with" under the button. */
  belowGallery?: React.ReactNode; belowBuy?: React.ReactNode
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
  const buyRef = useRef<HTMLButtonElement>(null)
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
    openBag(v.id)
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-10">
      {p.belowGallery ? <div className="min-w-0"><Gallery photos={photos} title={p.title} kind={p.gallery ?? 'swipe'} w={p.w} />{p.belowGallery}</div>
        : <Gallery photos={photos} title={p.title} kind={p.gallery ?? 'swipe'} w={p.w} />}
      <div className={`min-w-0 space-y-5 ${p.stickyBox ? 'md:sticky md:top-24 md:self-start' : ''}`}>
        <div className="space-y-2">
          <h1 className="store-pdp-title text-2xl leading-tight sm:text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{p.title}</h1>
          {shown && <p className="store-pdp-price text-lg"><span className="store-price font-medium">{money(shown.price)}</span>
            {shown.compareAt && shown.compareAt > shown.price && <><s className="ml-2 text-store-sub">{money(shown.compareAt)}</s><span className="ml-2 text-sm text-store-good">{fill(p.w.save, { amount: money(shown.compareAt - shown.price) })}</span></>}{shown.mrp && shown.mrp >= shown.price ? <span className="ml-2 text-xs text-store-sub">M.R.P. {money(shown.mrp)} incl. taxes</span> : null}</p>}
          {p.offers && p.offers.length > 0 && <ul className="store-offers space-y-1 text-sm text-store-sale" aria-label={p.w.offers}>{p.offers.map((o) => <li key={o.label}>{o.label}{o.ends ? ` · ${o.ends}` : ''}</li>)}</ul>}
          <p className="text-xs text-store-sub">{p.taxNote}</p>
        </div>

        {/* Colour is chosen first (it changes the photos), then size; other options after. */}
        {order.map((i) => [p.options[i]!, i] as const).map(([o, i]) => (
          <fieldset key={o} ref={i === si ? sizesRef : undefined} className="space-y-2">
            <legend className="store-opt-legend flex w-full items-baseline justify-between text-sm">
              <span><span className="font-medium">{o}</span>{picked[i] && <span className="text-store-sub">: {picked[i]}</span>}</span>
              {i === si && p.chart && p.chart.rows.length > 0 && <button type="button" className="inline-flex min-h-6 items-center underline underline-offset-4" onClick={() => setGuide(true)}>{p.w.sizeGuide}</button>}
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
                    className={`store-opt relative min-h-11 min-w-12 rounded-[var(--store-radius)] border px-3 text-sm ${on ? 'border-store-ink bg-store-ink text-store-paper' : 'border-store-line'} ${st.canBuy ? '' : 'text-store-sub line-through decoration-1'}`}>
                    {val}<span className="sr-only">{st.canBuy ? '' : p.w.soldOutSr}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        <p role="status" className={`min-h-5 text-sm ${a ? TONE[a.kind] : 'text-store-sub'}`}>{a ? labelOf(a, p.w) : p.options.length ? fill(p.w.pickToSee, { option: p.options.find((_, i) => picked[i] === null)?.toLowerCase() ?? p.w.size.toLowerCase() }) : ''}</p>
        {/* A sold-out size: the button stays, greyed and saying so (Google's merchant rule 2026: not hidden). */}
        <button ref={buyRef} type="button" onClick={add} aria-disabled={a && !a.canBuy ? true : undefined} className="store-btn store-buy h-12 w-full rounded-[var(--store-radius)] transition-transform duration-fast ease-standard active:scale-97 aria-disabled:opacity-50 aria-disabled:active:scale-100 bg-store-button text-base font-medium text-store-on-button">{a && !a.canBuy ? p.w.soldOut : a?.kind === 'preorder' ? p.w.preorder : p.w.addToBag}</button>
        {note && <p role="alert" className="text-sm">{note}</p>}
        {p.belowBuy}

        {/* The shop's true promises; a theme on tiles shows each with its icon (Signal's trust row). */}
        <ul className="store-promises space-y-1.5 border-t border-store-line pt-4 text-sm">
          {!p.zoned && cod?.offered && <li><PromiseIcon d={PAY} />{p.w.cod}{cod.charge > 0 ? fill(p.w.codExtra, { fee: money(cod.charge) }) : ''}</li>}
          {!p.zoned && shown && <li><PromiseIcon d={SHIP} />{deliveryLine(shown.price, p.delivery, p.w)}</li>}
          {/* notes: dispatch first, then returns (product-view.tsx) */}
          {p.notes.map((n, i) => <li key={n}><PromiseIcon d={i === 0 ? BOX : BACK} />{n}</li>)}
        </ul>
        {/* Delivery Zones PD·0: this PIN code's terms (every plan), on the shop itself only. */}
        {p.live !== false && <Suspense fallback={null}><DeliveryCheck price={shown?.price ?? null} w={p.w} /></Suspense>}
        {p.model && <p className="text-sm text-store-sub">{p.model}</p>}
      </div>
      {p.buyBar && <PhoneBar target={buyRef} title={p.title} price={shown ? money(shown.price) : null} label={a?.kind === 'preorder' ? p.w.preorder : p.w.addToBag} onAdd={() => { buyRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); add() }} aboveTabs={!!p.aboveTabs} />}
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
 * Photos, swiped on a phone (scroll-snap) in every layout. On a computer: swipe = the first large, the rest two-up
 * (today); thumbs = one at a time with a strip of buttons under it; rail (2.0) = one at a time with a column of
 * thumbnails beside it; stack (2.0) = every photo, one under the other. The first photo is the page's largest paint
 * and the only priority one; `sizes` says how wide each really is, so no photo downloads larger than it shows
 * (speed review 2026-11-09).
 */
function Gallery({ photos, title, kind, w }: { photos: Img[]; title: string; kind: Gallery; w: BuyWords }) {
  const [at, setAt] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  if (!photos.length) return <div className="grid aspect-[4/5] place-items-center rounded-sm bg-store-chip text-store-sub">{title}</div>
  const show = (i: number) => { const el = list.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }); setAt(i) }
  const single = kind === 'thumbs' || kind === 'rail'
  const ul = single ? '-mx-4 flex snap-x snap-mandatory overflow-x-auto md:mx-0 [&::-webkit-scrollbar]:hidden'
    : kind === 'stack' ? '-mx-4 flex snap-x snap-mandatory overflow-x-auto md:mx-0 md:flex-col md:gap-3 md:overflow-visible [&::-webkit-scrollbar]:hidden'
    : '-mx-4 flex snap-x snap-mandatory overflow-x-auto md:mx-0 md:grid md:grid-cols-2 md:gap-2 md:overflow-visible [&::-webkit-scrollbar]:hidden'
  const sizes = (i: number) => kind === 'rail' ? '(min-width: 768px) calc(55vw - 72px), 100vw' : kind === 'swipe' && i > 0 ? '(min-width: 768px) 27vw, 100vw' : '(min-width: 768px) 55vw, 100vw'
  const strip = single && photos.length > 1 && (
    <ul className={kind === 'rail' ? 'mt-2 flex gap-2 overflow-x-auto p-0.5 md:order-first md:mt-0 md:max-h-[44rem] md:flex-col md:overflow-y-auto' : 'mt-2 flex gap-2 overflow-x-auto p-0.5'} aria-label={w.choosePhoto}>
      {photos.map((ph, i) => (
        <li key={ph.base} className="shrink-0">
          <button type="button" onClick={() => show(i)} aria-label={fill(w.photoOf, { i: i + 1, n: photos.length })} aria-current={at === i ? 'true' : undefined}
            className={`block w-14 overflow-hidden rounded-[var(--store-radius)] ${at === i ? 'ring-2 ring-store-ink' : ''}`}>
            <Photo p={ph} alt="" sizes="56px" low className="aspect-[4/5] w-full bg-store-chip object-cover" />
          </button>
        </li>
      ))}
    </ul>
  )
  return (
    <div className={`min-w-0 ${kind === 'rail' ? 'md:flex md:gap-3' : ''}`}>
      <ul ref={list} className={`${ul} ${kind === 'rail' ? 'md:min-w-0 md:flex-1' : ''}`}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} aria-label={w.photos}>
        {photos.map((ph, i) => (
          <li key={ph.base} className={single ? 'w-full shrink-0 snap-center' : `w-full shrink-0 snap-center md:w-auto ${kind === 'swipe' && i === 0 ? 'md:col-span-2' : ''}`}>
            <Photo p={ph} alt={ph.alt || (i === 0 ? title : fill(w.photoAlt, { title, i: i + 1 }))} sizes={sizes(i)} priority={i === 0} className="aspect-[4/5] w-full bg-store-chip object-cover" />
          </li>
        ))}
      </ul>
      {strip}
      {!single && photos.length > 1 && <p className="mt-2 text-center text-xs text-store-sub md:hidden" aria-hidden="true">{at + 1} / {photos.length}</p>}
    </div>
  )
}

/**
 * Phones only (2.0 choice): the Add to bag bar slides up once the page's own button is out of view, and away when it
 * is back. Its own component, so showing it re-renders nothing else; portalled to the shop's root, so no transformed
 * ancestor (the page entrance) can pin it to the page (speed review 2026-11-09).
 */
function PhoneBar({ target, title, price, label, onAdd, aboveTabs }: { target: React.RefObject<HTMLButtonElement | null>; title: string; price: string | null; label: string; onAdd: () => void; aboveTabs: boolean }) {
  const [on, setOn] = useState(false)
  const [root, setRoot] = useState<Element | null>(null)
  useEffect(() => {
    setRoot(target.current?.closest('[data-store-theme]') ?? null)
    const el = target.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setOn(!!e && !e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [target])
  if (!root) return null
  return createPortal(
    <div inert={!on} aria-hidden={!on} className={`store-buybar fixed inset-x-0 z-40 flex items-center gap-3 border-t border-store-line bg-store-paper px-4 py-2 text-store-ink transition-transform duration-base ease-standard sm:hidden ${aboveTabs ? 'bottom-14' : 'bottom-0'} ${on ? 'translate-y-0' : 'translate-y-[calc(100%+3.5rem)]'}`}>
      <div className="min-w-0 flex-1"><p className="truncate text-sm">{title}</p>{price && <p className="text-sm font-medium">{price}</p>}</div>
      <button type="button" onClick={onAdd} className="store-btn store-buy h-11 shrink-0 rounded-[var(--store-radius)] bg-store-button px-5 text-sm font-medium text-store-on-button">{label}</button>
    </div>, root)
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
          <button type="button" onClick={close} className="grid size-11 place-items-center text-xl" aria-label={w.closeGuide}><CloseMark className="size-3.5" /></button>
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

const PAY = 'M3 7h18v12H3zM3 11h18', SHIP = 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.1M17 19a2 2 0 1 0 0-.1', BACK = 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4', BOX = 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8'
/** A promise's icon: hidden unless the theme shows its promises as a trust row (globals.css, data-card="tile"). */
function PromiseIcon({ d }: { d: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="store-promise-i"><path d={d} /></svg>
}
