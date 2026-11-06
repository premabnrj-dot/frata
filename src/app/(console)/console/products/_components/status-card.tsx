'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { visibility, type Status } from '@/domains/catalogue/availability'
import type { Readiness } from '@/domains/catalogue/product-form'
import { setStatus } from '../actions'

const CHOICES: { v: Status; label: string; says: string }[] = [
  { v: 'draft', label: 'Draft', says: 'Only your team sees it.' },
  { v: 'active', label: 'Active', says: 'On your shop, in collections and search, and sent to Google and Meta.' },
  { v: 'unlisted', label: 'Unlisted', says: 'Opens from its link only: not in menus, search or Google. For a private drop or a DM.' },
  { v: 'archived', label: 'Archived', says: 'Gone from your shop. Its page says it is no longer available, with your newest pieces below.' },
]

/** "2026-12-01T10:00" in India time ↔ an ISO moment. */
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16) : '')
const fromLocal = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : null)

/** Who can find the product. Separate from Save: changing who sees it is its own decision. */
export function StatusCard({ productId, status, publishAt, ready, dirty }: { productId: string; status: Status; publishAt: string | null; ready: Readiness; dirty: boolean }) {
  const router = useRouter()
  const [pick, setPick] = useState<Status>(status)
  const [when, setWhen] = useState(toLocal(publishAt))
  const [later, setLater] = useState(!!publishAt)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const allReady = ready.every((r) => r.ok)
  const needsReady = pick === 'active' || pick === 'unlisted'
  const at = pick === 'active' && later ? fromLocal(when) : null
  const changed = pick !== status || (pick === 'active' && at !== (publishAt ? new Date(publishAt).toISOString() : null))
  const v = visibility(pick, at ? new Date(at) : null, new Date())
  const blocked = (needsReady && !allReady) || (pick === 'active' && later && !when)

  const apply = () => start(async () => {
    const r = await setStatus(productId, pick, at)
    setMsg(r.ok ? { ok: true, text: 'Done.' } : { ok: false, text: r.error })
    if (r.ok) router.refresh()
  })

  return (
    <section aria-labelledby="status-h" className="space-y-3 rounded-md border border-border bg-card p-4">
      <h2 id="status-h" className="font-semibold">Status</h2>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Who can find this product</legend>
        {CHOICES.map((c) => (
          <label key={c.v} className={`flex cursor-pointer gap-2 rounded-md border p-2 text-sm transition-colors duration-fast ${pick === c.v ? 'border-ring bg-accent' : 'border-border hover:bg-accent'}`}>
            <input type="radio" name="status" value={c.v} checked={pick === c.v} onChange={() => { setPick(c.v); setMsg(null) }} className="mt-0.5" />
            <span><span className="font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.says}</span></span>
          </label>
        ))}
      </fieldset>
      {pick === 'active' && (
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> Go live later (a scheduled drop)</label>
          {later && <div className="space-y-1"><label htmlFor="publish-at" className="block text-xs font-medium">From, India time</label>
            <input id="publish-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm" />
            <p className="text-xs text-muted-foreground">Hidden until then; it appears by itself.</p></div>}
        </div>
      )}
      {needsReady && (
        <ul className="space-y-0.5 text-sm" aria-label="Needed before shoppers see it">
          {ready.map((r) => <li key={r.label} className={r.ok ? 'text-ok-text' : 'text-warn-text'}><span aria-hidden="true">{r.ok ? '✓ ' : '• '}</span>{r.label}{r.ok ? '' : ' (missing)'}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{v.scheduled ? 'Shoppers get "page not found" until it goes live.' : v.listed ? 'Shoppers can find it and buy it.' : v.reachable ? 'Shoppers with the link can buy it.' : pick === 'archived' ? 'Shoppers read that it is no longer available.' : 'Shoppers get "page not found".'}</p>
      {changed && <Button className="w-full" disabled={pending || blocked || dirty} onClick={apply}>{pick === 'active' && !later ? 'Make it active' : pick === 'active' ? 'Schedule it' : `Set to ${CHOICES.find((c) => c.v === pick)!.label.toLowerCase()}`}</Button>}
      {changed && dirty && <p className="text-xs text-muted-foreground">Save your changes first.</p>}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok-text' : 'text-danger-text'}`}>{msg.text}</p>}
    </section>
  )
}
