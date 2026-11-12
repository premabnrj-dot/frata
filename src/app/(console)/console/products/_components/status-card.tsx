'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { InfoTip } from '@/components/ui/info-tip'
import { Icon } from '@/components/icons/icon'
import { visibility, type Status } from '@/domains/catalogue/availability'
import type { Readiness } from '@/domains/catalogue/product-form'
import { setStatus } from '../actions'
import { Section } from '@/components/layout/section'
import { useNow } from '@/components/time/now'

const CHOICES: { v: Status; label: string; says: string }[] = [
  { v: 'draft', label: 'Draft', says: 'Only your team sees it.' },
  { v: 'active', label: 'Active', says: 'On your shop, in collections and search, and sent to Google and Meta.' },
  { v: 'unlisted', label: 'Unlisted', says: 'Opens from its link only: not in menus, search or Google. For a private drop or a DM.' },
  { v: 'archived', label: 'Archived', says: 'Gone from your shop. Its page says it is no longer available, with your newest pieces below.' },
]

/** "2026-12-01T10:00" in India time ↔ an ISO moment. */
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16) : '')
const fromLocal = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : null)

/** Who can find the product: its own decision, and one action with Save (products PR·2): with unsaved changes the button
 *  saves them first ("Save and make it active"), then changes the status; a save that is refused stops there, its
 *  mistakes at their fields. The readiness checked is the draft's, so what goes live is what was just saved. */
export function StatusCard({ productId, status, publishAt, ready, dirty, saveFirst }: { productId: string; status: Status; publishAt: string | null; ready: Readiness; dirty: boolean; saveFirst?: () => Promise<boolean> }) {
  const router = useRouter()
  const [pick, setPick] = useState<Status>(status)
  const [when, setWhen] = useState(toLocal(publishAt))
  const [later, setLater] = useState(!!publishAt)
  const toast = useToast()
  const [pending, start] = useTransition()
  const allReady = ready.every((r) => r.ok)
  const needsReady = pick === 'active' || pick === 'unlisted'
  const at = pick === 'active' && later ? fromLocal(when) : null
  const changed = pick !== status || (pick === 'active' && at !== (publishAt ? new Date(publishAt).toISOString() : null))
  const now = useNow()
  const v = visibility(pick, at ? new Date(at) : null, now)
  const blocked = (needsReady && !allReady) || (pick === 'active' && later && !when)

  const apply = () => start(async () => {
    if (dirty) { if (!saveFirst || !(await saveFirst())) return }
    // The result is a toast (§ Feedback 1, 2).
    const r = await setStatus(productId, pick, at)
    if (!r.ok) { toast.error(r.error); return }
    toast.ok('Done.'); router.refresh()
  })

  return (
    <Section labelledBy="status-h">
      <h2 id="status-h" className="text-section font-semibold">Status</h2>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Who can find this product</legend>
        {/* One line each; what a status means is behind its (i) (visual changes, owner-approved 2026-11-08). */}
        {CHOICES.map((c) => (
          <div key={c.v} className={`flex items-center rounded-md border pr-1 text-sm transition-colors duration-fast ${pick === c.v ? 'border-ring bg-accent' : 'border-border hover:bg-accent'}`}>
            <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-2 px-2">
              <input type="radio" name="status" value={c.v} checked={pick === c.v} onChange={() => setPick(c.v)} />
              <span className="font-medium">{c.label}</span>
            </label>
            <InfoTip about={`${c.label.toLowerCase()} products`}>{c.says}</InfoTip>
          </div>
        ))}
      </fieldset>
      {pick === 'active' && (
        <div className="space-y-1.5 text-sm">
          <label className="flex min-h-6 items-center gap-2"><input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> Go live later (a scheduled drop)</label>
          {later && <div className="space-y-1"><label htmlFor="publish-at" className="block text-xs font-medium">From, India time</label>
            <input id="publish-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-2 text-sm" />
            <p className="text-xs text-muted-foreground">Hidden until then; it appears by itself.</p></div>}
        </div>
      )}
      {needsReady && (
        // The checklist as its count; it opens by itself when something is missing.
        <details open={!allReady} className="group text-sm">
          <summary className="flex min-h-6 cursor-pointer list-none items-center gap-2">
            <Badge tone={allReady ? 'ok' : 'warn'}>{allReady ? 'Ready' : 'Not ready'} · {ready.filter((r) => r.ok).length} of {ready.length}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Icon name="chevron" className="size-3.5 transition-transform duration-fast group-open:rotate-90" />What’s checked</span>
          </summary>
          <ul className="mt-1.5 space-y-0.5" aria-label="Needed before shoppers see it">
            {ready.map((r) => <li key={r.label} className={r.ok ? 'text-ok-text' : 'text-warn-text'}><span aria-hidden="true">{r.ok ? '✓ ' : '• '}</span>{r.label}{r.ok ? '' : ' (missing)'}</li>)}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted-foreground">{v.scheduled ? 'Shoppers get "page not found" until it goes live.' : v.listed ? 'Shoppers can find it and buy it.' : v.reachable ? 'Shoppers with the link can buy it.' : pick === 'archived' ? 'Shoppers read that it is no longer available.' : 'Shoppers get "page not found".'}</p>
      {changed && <Button className="w-full" disabled={pending || blocked || (dirty && !saveFirst)} onClick={apply}>{(dirty ? 'Save and ' : '') + (pick === 'active' && !later ? (dirty ? 'make it active' : 'Make it active') : pick === 'active' ? (dirty ? 'schedule it' : 'Schedule it') : `${dirty ? 'set' : 'Set'} to ${CHOICES.find((c) => c.v === pick)!.label.toLowerCase()}`)}</Button>}
    </Section>
  )
}
