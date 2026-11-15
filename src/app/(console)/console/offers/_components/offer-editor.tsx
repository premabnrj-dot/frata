'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { keptWithOff, type OfferExample } from '@/domains/orders/offer-kept'
import { FoldSection } from '@/components/layout/fold-section'
import { Segmented } from '@/components/ui/segmented'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { LeaveDialog, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { FieldError, errorId, fieldProps, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { parseOffer, type OfferValues } from '@/domains/checkout/offer-form'
import { barText } from '@/domains/checkout/offer-text'
import type { DiscountStyle } from '@/domains/checkout/discounts'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { checkQualify, saveOffer } from '../actions'
import { OfferMore, type Pickers } from './offer-more'
import { InfoTip } from '@/components/ui/info-tip'
import { FIELD } from '@/components/ui/field'

// =============================================================================
// THE OFFER FORM (spec § Console; mockup "The founder's side"): one short form for the chosen style, a live preview
// of what shoppers will see, and the "already qualify" warning for an order offer with a minimum. Started offers are
// changed by owners and admins only (the action enforces it; `locked` greys what cannot change at all).
// =============================================================================

const inr = (p: number) => formatInr(paise(p))
const field = `${FIELD} w-full`


// The kinds as drawn (Offer board: Order offer, Pay online, Free delivery, Buy more), then the two the board did not draw.
const KIND_ORDER: DiscountStyle[] = ['order_off', 'pay_online', 'free_shipping', 'bxgy', 'product_off', 'free_gift']
const KIND_CARD: Record<DiscountStyle, { name: string; line: string }> = {
  order_off: { name: 'Order offer', line: 'Off the bag' }, pay_online: { name: 'Pay online', line: 'Less for paying now' },
  free_shipping: { name: 'Free delivery', line: 'Above a bag total' }, bxgy: { name: 'Buy more', line: 'Buy 2, get 1 free' },
  product_off: { name: 'Products off', line: 'On chosen products' }, free_gift: { name: 'Free gift', line: 'Above a bag total' },
}
/** What a shopper reads for these values: the bar's own words (offer-text.ts), from the same parse the action uses. */
function preview(v: OfferValues): { bar: string; bag: string } | null {
  const p = parseOffer(v)
  if (!p.ok) return null
  const o = p.patch
  const bar = barText(o, { code: o.listed ? o.code : null, endsAt: o.endsAt })
  const bag = o.style === 'pay_online' ? 'On the pay-online card at checkout' : o.minSubtotal ? `Bag: "₹… more for ${o.title}" until it reaches ${inr(o.minSubtotal)}` : `Bag: "${o.title}" applied`
  return { bar, bag }
}

/** One piece of the store's best seller, as the server worked it out (offer-cost.ts): never its goods' cost. */
export type OfferCostExample = { title: string; price: number; example: OfferExample }

export function OfferEditor({ id, initial, locked, pickers, example = null }: { id: string | null; initial: OfferValues; locked: { style: boolean; code: boolean }; pickers: Pickers
  /** Only for whoever sees costs; null hides "What it costs you". */
  example?: OfferCostExample | null }) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [v, setV] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const toast = useToast()
  const form = useRef<HTMLDivElement>(null)
  // Field mistakes stay at their fields; one summary toast counts them (a refusal said with them is its second line).
  const [attempt, setAttempt] = useState(0)
  const [also, setAlso] = useState<string | undefined>(undefined)
  useErrorSummary(errors, { attempt, scope: form, sub: also })
  const [pending, start] = useTransition()
  const [qualify, setQualify] = useState<{ orders: number; qualify: number; would: number } | null>(null)
  const dirty = JSON.stringify(v) !== JSON.stringify(saved)
  const guard = useLeaveGuard(dirty && !!id)
  // A field's mistake goes the moment it changes (a step's or a pick's with it); nothing typed is cleared.
  const set = (patch: Partial<OfferValues>) => {
    setV((x) => ({ ...x, ...patch }))
    const gone = new Set<string>(Object.keys(patch))
    if ('tiers' in patch) for (const k of Object.keys(errors)) if (k.startsWith('tier')) gone.add(k)
    if ('targetIds' in patch) gone.add('targets')
    if ([...gone].some((k) => errors[k])) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !gone.has(k))))
  }
  const style = v.style as DiscountStyle
  const p = preview(v)

  // The warning: an order offer with a minimum, re-asked a moment after the numbers change (the newest answer wins).
  const seq = useRef(0)
  useEffect(() => {
    const parsed = parseOffer(v)
    if (!parsed.ok || parsed.patch.style !== 'order_off') { setQualify(null); return }
    const n = ++seq.current, o = parsed.patch
    const t = setTimeout(async () => { const r = await checkQualify({ minSubtotal: o.minSubtotal, percentBps: o.percentBps, amountOff: o.amountOff, cap: o.cap }); if (n === seq.current) setQualify(r) }, 400)
    return () => clearTimeout(t)
  }, [v.style, v.kind, v.value, v.cap, v.min]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => start(async () => {
    const r = await saveOffer(id, v)
    if (!r.ok) {
      const fields = r.errors ?? {}
      const bad = Object.keys(fields).length > 0
      setAlso(bad ? r.error : undefined); setErrors(fields)
      if (bad) setAttempt((a) => a + 1); else toast.error(r.error)
      return
    }
    setSaved(v); setErrors({}); toast.ok('Saved.')
    if (!id) router.replace(`/console/offers/${r.id}`)
    else router.refresh()
  })
  const err = (k: string) => <FieldError name={`o-${k}`} message={errors[k]} />
  const fp = (k: string) => fieldProps(`o-${k}`, errors[k])
  const lab = 'block text-sm font-medium'
  const share = qualify && qualify.orders >= 5 ? Math.round((qualify.qualify / qualify.orders) * 100) : null

  // What it costs on the best seller: the off this offer gives one piece of it (a percent capped, or an amount).
  const pct = v.kind === 'percent' ? Number(v.value) || 0 : 0
  const amt = v.kind === 'amount' ? Math.round((Number(v.value) || 0) * 100) : 0
  const capP = v.cap ? Math.round((Number(v.cap) || 0) * 100) : null
  const off = example ? Math.min(example.price, v.kind === 'percent' ? Math.min(Math.round((example.price * pct) / 100), capP ?? Infinity) : amt) : 0
  return (
    <div ref={form} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-w-0 space-y-4">
      {dirty && id && <SaveBar pending={pending} onSave={save} onDiscard={() => { setV(saved); setErrors({}) }} />}
      {!locked.style && (
        <Section title="What kind">
          <fieldset><legend className="sr-only">Offer style</legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {KIND_ORDER.map((k) => (
                <label key={k} className={`flex cursor-pointer gap-2 rounded-mid border p-3 text-sm ${style === k ? 'border-ring bg-select' : 'border-border hover:bg-accent'}`}>
                  <input type="radio" name="style" checked={style === k} onChange={() => set({ style: k, kind: k === 'pay_online' ? 'amount' : v.kind })} className="mt-0.5" />
                  <span><span className="font-medium">{KIND_CARD[k].name}</span><span className="block text-xs text-muted-foreground">{KIND_CARD[k].line}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        </Section>
      )}

      <Section title="The offer">
        {/* As drawn: name and code, then what comes off with its floor and cap, the "already qualify" line, then when. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor="o-title" className={lab}>Name shoppers see</label>
            <input id="o-title" value={v.title} maxLength={60} placeholder="Diwali sale" {...fp('title')} onChange={(e) => set({ title: e.target.value })} className={field} />{err('title')}</div>
          <div className="space-y-1"><label htmlFor="o-code" className={lab}>Code <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="o-code" value={v.code} maxLength={20} disabled={locked.code} placeholder="FESTIVE10" autoCapitalize="characters" {...fp('code')} aria-describedby={errors.code ? errorId('o-code') : locked.code ? 'o-code-hint' : undefined}
              onChange={(e) => set({ code: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} className={`${field} font-mono`} />
            {errors.code ? err('code') : locked.code ? <p id="o-code-hint" className="text-xs text-muted-foreground">A code never changes. End this offer and make a new one to use another.</p> : null}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(style === 'order_off' || style === 'product_off' || style === 'pay_online') && (
            <div className="space-y-1"><span id="o-take" className={lab}>Take off</span>
              <div className="flex gap-2">
                <Segmented label="Percent or rupees" value={v.kind === 'percent' ? 'percent' : 'amount'} options={[['percent', '%'], ['amount', '₹']] as const} onPick={(k) => set({ kind: k })} className="shrink-0 flex-nowrap" />
                <input id="o-value" aria-label="How much" inputMode="decimal" value={v.value} placeholder={v.kind === 'percent' ? '10' : '50'} {...fp('value')} onChange={(e) => set({ value: e.target.value })} className={`${field} min-w-0`} />
              </div>{err('value')}</div>
          )}
          <div className="space-y-1"><label htmlFor="o-min" className={lab}>{style === 'free_gift' ? 'Free when the rest of the bag reaches, ₹' : 'When the bag is at least, ₹'}</label>
            <input id="o-min" inputMode="decimal" value={v.min} placeholder="1,999" {...fp('min')} onChange={(e) => set({ min: e.target.value })} className={field} />{err('min')}</div>
          {v.kind === 'percent' && (style === 'order_off' || style === 'product_off') && <div className="space-y-1"><label htmlFor="o-cap" className={lab}>Most off, ₹ <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="o-cap" inputMode="decimal" value={v.cap} {...fp('cap')} onChange={(e) => set({ cap: e.target.value })} className={field} />{err('cap')}</div>}
        </div>
        {share !== null && share >= 40 && qualify && (
          <p role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text">
            {share}% of last month’s orders were already over {inr(Math.round((Number(v.min) || 0) * 100))}. They would get {v.kind === 'percent' ? `${Number(v.value) || 0}%` : inr(Math.round((Number(v.value) || 0) * 100))} off anyway.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor="o-starts" className={lab}>Starts</label>
            <input id="o-starts" type="datetime-local" value={v.startsAt} {...fp('startsAt')} onChange={(e) => set({ startsAt: e.target.value })} className={field} />{err('startsAt')}</div>
          <div className="space-y-1"><label htmlFor="o-ends" className={lab}>Ends <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="o-ends" type="datetime-local" value={v.endsAt} {...fp('endsAt')} onChange={(e) => set({ endsAt: e.target.value })} className={field} />{err('endsAt')}</div>
        </div>
      </Section>

      {/* What the board left out but an offer has: its products, steps and rules, limits and the bar, folded (Deviations). */}
      <FoldSection title="Limits and more" start={!!(v.limitTotal || v.limitPerPhone || v.budget || v.announce || v.firstOrder || (v.targets && v.targets !== 'all') || v.tiers?.length) || ['limitTotal', 'limitPerPhone', 'budget', 'announce', 'targets', 'tiers'].some((k) => errors[k])}
        invalid={['limitTotal', 'limitPerPhone', 'budget', 'announce', 'targets', 'tiers'].some((k) => errors[k])} action="Edit">
        <OfferMore v={v} set={set} errors={errors} pickers={pickers} />
        {v.code && <label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" className="shrink-0" checked={v.listed} onChange={(e) => set({ listed: e.target.checked })} />Show the code at checkout</label>}
        {style === 'order_off' && <label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" className="shrink-0" checked={v.combinesWithPayment} onChange={(e) => set({ combinesWithPayment: e.target.checked })} />Shoppers who pay online also get your pay-online saving</label>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><label htmlFor="o-total" className={lab}>Total uses <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="o-total" inputMode="numeric" value={v.limitTotal} {...fp('limitTotal')} onChange={(e) => set({ limitTotal: e.target.value })} className={field} />{err('limitTotal')}</div>
          <div className="space-y-1"><label htmlFor="o-phone" className={lab}>Uses per phone <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="o-phone" inputMode="numeric" value={v.limitPerPhone} {...fp('limitPerPhone')} onChange={(e) => set({ limitPerPhone: e.target.value })} className={field} />{err('limitPerPhone')}</div>
          <div className="space-y-1"><div className="flex items-center"><label htmlFor="o-budget" className={lab}>Budget, ₹ <span className="font-normal text-muted-foreground">(optional)</span></label><InfoTip about="the budget">The offer stops giving once this much has been given.</InfoTip></div>
            <input id="o-budget" inputMode="decimal" value={v.budget} {...fp('budget')} onChange={(e) => set({ budget: e.target.value })} className={field} />{err('budget')}</div>
        </div>
        <div className="flex items-center"><label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" className="shrink-0" checked={v.announce} {...fp('announce')} onChange={(e) => set({ announce: e.target.checked })} />Show it in the bar at the top of your store</label><InfoTip about="the bar">One offer at a time. A draft takes the bar when it starts.</InfoTip></div>{err('announce')}
        <p className="text-xs text-muted-foreground">Times are India time. Shoppers see an end date only if you set one.</p>
      </FoldSection>

      {!id && <div className="flex gap-2"><Button onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save as draft'}</Button></div>}
    </div>
    {/* The side, as drawn: what shoppers will see, then what it costs you (only for whoever sees costs). */}
    <aside className="space-y-4 lg:sticky lg:top-[calc(var(--shell-top,0px)+1rem)]">
      <Section title="What shoppers see" ariaLabel="Preview">
        {p ? <div className="space-y-2 text-sm">
          <p className="text-label text-muted-foreground">The bar at the top of the store</p>
          <p className="rounded-md bg-bar px-3 py-2 text-center text-label text-bar-foreground">{p.bar}</p>
          <p className="text-label text-muted-foreground">In the bag{Number(v.min) > 0 ? `, under ${inr(Math.round(Number(v.min) * 100))}` : ''}</p>
          <p className="rounded-md bg-sunk px-3 py-2 text-label">{p.bag}</p></div>
          : <p className="text-sm text-muted-foreground">Fill in the offer to see it as shoppers will.</p>}
      </Section>
      {example ? (
        <Section title="What it costs you">
          <p className="text-sm tabular-nums">{off > 0
            ? <>On a {inr(example.price)} {example.title}: {inr(off)} off. You keep {inr(keptWithOff(example.example, off))} instead of {inr(Math.round(example.example.keptAt0))}.</>
            : <>On a {inr(example.price)} {example.title} you keep {inr(Math.round(example.example.keptAt0))} today.</>}</p>
          <p className="text-label text-muted-foreground">Delivered, after GST, goods, courier and Frrata’s fee. Before ads and packaging.</p>
        </Section>
      ) : null}
    </aside>
      <LeaveDialog open={!!guard.leaveTo} what="this offer" onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(v))} />
    </div>
  )
}
