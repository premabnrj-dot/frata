'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { LeaveDialog, Message, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { STYLE_LABEL, parseOffer, type OfferValues } from '@/domains/checkout/offer-form'
import { barText } from '@/domains/checkout/offer-text'
import type { DiscountStyle } from '@/domains/checkout/discounts'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { checkQualify, saveOffer } from '../actions'
import { OfferMore, type Pickers } from './offer-more'

// =============================================================================
// THE OFFER FORM (spec § Console; mockup "The founder's side"): one short form for the chosen style, a live preview
// of what shoppers will see, and the "already qualify" warning for an order offer with a minimum. Started offers are
// changed by owners and admins only (the action enforces it; `locked` greys what cannot change at all).
// =============================================================================

const inr = (p: number) => formatInr(paise(p))
const field = 'h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text disabled:opacity-60'

/** What a shopper reads for these values: the bar's own words (offer-text.ts), from the same parse the action uses. */
function preview(v: OfferValues): { bar: string; bag: string } | null {
  const p = parseOffer(v)
  if (!p.ok) return null
  const o = p.patch
  const bar = barText(o, { code: o.listed ? o.code : null, endsAt: o.endsAt })
  const bag = o.style === 'pay_online' ? 'On the pay-online card at checkout' : o.minSubtotal ? `Bag: "₹… more for ${o.title}" until it reaches ${inr(o.minSubtotal)}` : `Bag: "${o.title}" applied`
  return { bar, bag }
}

export function OfferEditor({ id, initial, locked, pickers }: { id: string | null; initial: OfferValues; locked: { style: boolean; code: boolean }; pickers: Pickers }) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [v, setV] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const [qualify, setQualify] = useState<{ orders: number; qualify: number; would: number } | null>(null)
  const dirty = JSON.stringify(v) !== JSON.stringify(saved)
  const guard = useLeaveGuard(dirty && !!id)
  const set = (patch: Partial<OfferValues>) => { setV((x) => ({ ...x, ...patch })); setMsg(null) }
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
    if (!r.ok) { setErrors(r.errors ?? {}); setMsg({ tone: 'error', text: r.error }); return }
    setSaved(v); setErrors({}); setMsg({ tone: 'ok', text: 'Saved.' })
    if (!id) router.replace(`/console/offers/${r.id}`)
    else router.refresh()
  })
  const err = (k: string) => (errors[k] ? <p id={`o-${k}-err`} className="text-xs text-danger-text">{errors[k]}</p> : null)
  const lab = 'block text-sm font-medium'
  const share = qualify && qualify.orders >= 5 ? Math.round((qualify.qualify / qualify.orders) * 100) : null

  return (
    <div className="space-y-4">
      {dirty && id && <SaveBar pending={pending} onSave={save} onDiscard={() => { setV(saved); setErrors({}) }} />}
      <Message m={msg} />
      {!locked.style && (
        <Section title="Style">
          <fieldset><legend className="sr-only">Offer style</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(STYLE_LABEL) as DiscountStyle[]).map((k) => (
                <label key={k} className={`flex cursor-pointer gap-2 rounded-md border p-2 text-sm ${style === k ? 'border-ring bg-accent' : 'border-border'}`}>
                  <input type="radio" name="style" checked={style === k} onChange={() => set({ style: k, kind: k === 'pay_online' ? 'amount' : v.kind })} className="mt-0.5" />
                  <span><span className="font-medium">{STYLE_LABEL[k].name}</span><span className="block text-xs text-muted-foreground">{STYLE_LABEL[k].line}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        </Section>
      )}

      <Section title={STYLE_LABEL[style]?.name ?? 'Offer'}>
        <div className="space-y-1"><label htmlFor="o-title" className={lab}>Name <span className="font-normal text-muted-foreground">(shown to shoppers)</span></label>
          <input id="o-title" value={v.title} maxLength={60} placeholder="Diwali sale" aria-invalid={!!errors.title || undefined} aria-describedby={errors.title ? 'o-title-err' : undefined} onChange={(e) => set({ title: e.target.value })} className={field} />{err('title')}</div>
        {(style === 'order_off' || style === 'product_off' || style === 'pay_online') && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><label htmlFor="o-kind" className={lab}>Off</label>
              <select id="o-kind" value={v.kind} onChange={(e) => set({ kind: e.target.value })} className={field}><option value="percent">a percentage</option><option value="amount">an amount (₹)</option></select></div>
            <div className="space-y-1"><label htmlFor="o-value" className={lab}>{v.kind === 'percent' ? 'Percent' : 'Rupees'}</label>
              <input id="o-value" inputMode="decimal" value={v.value} placeholder={v.kind === 'percent' ? '10' : '50'} aria-invalid={!!errors.value || undefined} aria-describedby={errors.value ? 'o-value-err' : undefined} onChange={(e) => set({ value: e.target.value })} className={field} />{err('value')}</div>
            {v.kind === 'percent' && <div className="space-y-1"><label htmlFor="o-cap" className={lab}>At most ₹ <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input id="o-cap" inputMode="decimal" value={v.cap} aria-invalid={!!errors.cap || undefined} aria-describedby={errors.cap ? 'o-cap-err' : undefined} onChange={(e) => set({ cap: e.target.value })} className={field} />{err('cap')}</div>}
          </div>
        )}
        <OfferMore v={v} set={set} errors={errors} pickers={pickers} />
        <div className="space-y-1"><label htmlFor="o-min" className={lab}>{style === 'free_gift' ? 'Free when the rest of the bag reaches ₹' : 'Bag at least ₹'} <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="o-min" inputMode="decimal" value={v.min} placeholder="1999" aria-invalid={!!errors.min || undefined} aria-describedby={errors.min ? 'o-min-err' : undefined} onChange={(e) => set({ min: e.target.value })} className={`${field} sm:max-w-48`} />{err('min')}</div>
        {share !== null && share >= 40 && qualify && (
          <p role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text">
            <b>{share}% of last month’s orders were already at this amount.</b> About {inr(qualify.would)} would go to them. A higher minimum rewards bigger bags instead.
          </p>
        )}
        <div className="space-y-1"><label htmlFor="o-code" className={lab}>Code <span className="font-normal text-muted-foreground">(optional; without one it applies by itself)</span></label>
          <input id="o-code" value={v.code} maxLength={20} disabled={locked.code} placeholder="DIWALI15" autoCapitalize="characters" aria-invalid={!!errors.code || undefined} aria-describedby={errors.code ? 'o-code-err' : 'o-code-hint'}
            onChange={(e) => set({ code: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} className={`${field} font-mono sm:max-w-60`} />
          {errors.code ? err('code') : <p id="o-code-hint" className="text-xs text-muted-foreground">{locked.code ? 'A code never changes. End this offer and make a new one to use another.' : 'Codes are never reused in your shop.'}</p>}</div>
        {v.code && <label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={v.listed} onChange={(e) => set({ listed: e.target.checked })} />Show it at checkout (unticked: only shoppers who type the code get it)</label>}
        {style === 'order_off' && <label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={v.combinesWithPayment} onChange={(e) => set({ combinesWithPayment: e.target.checked })} />Shoppers who pay online also get your pay-online saving</label>}
      </Section>

      <Section title="When and how much">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor="o-starts" className={lab}>Starts</label>
            <input id="o-starts" type="datetime-local" value={v.startsAt} aria-invalid={!!errors.startsAt || undefined} aria-describedby={errors.startsAt ? 'o-startsAt-err' : undefined} onChange={(e) => set({ startsAt: e.target.value })} className={field} />{err('startsAt')}</div>
          <div className="space-y-1"><label htmlFor="o-ends" className={lab}>Ends <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="o-ends" type="datetime-local" value={v.endsAt} aria-invalid={!!errors.endsAt || undefined} aria-describedby={errors.endsAt ? 'o-endsAt-err' : undefined} onChange={(e) => set({ endsAt: e.target.value })} className={field} />{err('endsAt')}</div>
          <div className="space-y-1"><label htmlFor="o-total" className={lab}>Total uses <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="o-total" inputMode="numeric" value={v.limitTotal} aria-invalid={!!errors.limitTotal || undefined} aria-describedby={errors.limitTotal ? 'o-limitTotal-err' : undefined} onChange={(e) => set({ limitTotal: e.target.value })} className={field} />{err('limitTotal')}</div>
          <div className="space-y-1"><label htmlFor="o-phone" className={lab}>Uses per phone <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="o-phone" inputMode="numeric" value={v.limitPerPhone} aria-invalid={!!errors.limitPerPhone || undefined} aria-describedby={errors.limitPerPhone ? 'o-limitPerPhone-err' : undefined} onChange={(e) => set({ limitPerPhone: e.target.value })} className={field} />{err('limitPerPhone')}</div>
          <div className="space-y-1 sm:col-span-2"><label htmlFor="o-budget" className={lab}>Budget ₹ <span className="font-normal text-muted-foreground">(optional; it stops giving when this much is given)</span></label>
            <input id="o-budget" inputMode="decimal" value={v.budget} aria-invalid={!!errors.budget || undefined} aria-describedby={errors.budget ? 'o-budget-err' : undefined} onChange={(e) => set({ budget: e.target.value })} className={`${field} sm:max-w-48`} />{err('budget')}</div>
        </div>
        <label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={v.announce} aria-describedby={errors.announce ? 'o-announce-err' : undefined} onChange={(e) => set({ announce: e.target.checked })} />Show it in the bar at the top of your shop (one offer at a time; a draft takes the bar when it starts)</label>{err('announce')}
        <p className="text-xs text-muted-foreground">Times are India time. Shoppers see an end date only if you set one.</p>
      </Section>

      <Section title="Shoppers will see" ariaLabel="Preview">
        {p ? <div className="space-y-2 text-sm"><p className="rounded-sm bg-foreground px-3 py-2 text-center text-xs text-background">{p.bar}</p><p className="text-muted-foreground">{p.bag}</p></div>
          : <p className="text-sm text-muted-foreground">Fill in the offer to see it as shoppers will.</p>}
      </Section>

      {!id && <div className="flex gap-2"><Button onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save as draft'}</Button></div>}
      {guard.leaveTo && <LeaveDialog what="this offer" onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(v))} />}
    </div>
  )
}
