'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import type { Status } from '@/domains/catalogue/availability'
import type { Readiness } from '@/domains/catalogue/product-form'
import { setStatus } from '../actions'
import { Section } from '@/components/layout/section'
import { cn } from '@/lib/utils'

const CHOICES = [['draft', 'Draft'], ['active', 'Active'], ['unlisted', 'Unlisted']] as const
type Pick = (typeof CHOICES)[number][0]

/** "2026-12-01T10:00" in India time ↔ an ISO moment. */
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16) : '')
const fromLocal = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : null)

/**
 * Who can find the product (Neel N2, mockup § The editor: "Draft · Active · Unlisted", "Missing: …", Publish). The switch
 * is a choice, not an action: arrowing through it changes nothing until the button below. With unsaved changes the button
 * saves them first, then changes the status (one action); a refused save stops there, its mistakes at their fields. Going
 * Active or Unlisted needs what `readiness` lists: while something is missing the button stays focusable but does nothing
 * (aria-disabled), and the Missing line says what. Archived is not in the drawn switch: an archived product says so here
 * with Unarchive (Archive itself is in More). Going live later (a scheduled drop) stays under Active.
 */
export function StatusCard({ productId, status, publishAt, ready, feed = [], dirty, saveFirst }: { productId: string; status: Status; publishAt: string | null; ready: Readiness
  /** What Google and Meta's feeds still need (never blocks publishing): said under the switch (was the Ready for card). */
  feed?: string[]; dirty: boolean; saveFirst?: () => Promise<boolean> }) {
  const router = useRouter()
  const missingId = useId()
  const [pick, setPick] = useState<Pick>(status === 'archived' ? 'draft' : status)
  const [when, setWhen] = useState(toLocal(publishAt))
  const [later, setLater] = useState(!!publishAt)
  const toast = useToast()
  const [pending, start] = useTransition()
  const missing = ready.filter((r) => !r.ok)
  // As drawn: a draft offers Publish while Draft is still picked; picking another state offers that change instead.
  // An Active product stays Active with its schedule open to change (move, cancel or bring forward a drop).
  const to: Status | null = pick !== status ? pick : status === 'draft' || status === 'active' ? 'active' : null
  const needsReady = to === 'active' || to === 'unlisted'
  const at = to === 'active' && later ? fromLocal(when) : null
  const changed = to !== null && (to !== status || at !== (publishAt ? new Date(publishAt).toISOString() : null))
  const blocked = (needsReady && missing.length > 0) || (to === 'active' && later && !when)

  const apply = (to: Status) => start(async () => {
    if (dirty) { if (!saveFirst || !(await saveFirst())) return }
    const r = await setStatus(productId, to, to === 'active' ? at : null)
    if (!r.ok) { toast.error(r.error); return }
    toast.ok(to === 'active' && !at ? 'Published. Your store shows it now.' : 'Done.'); router.refresh()
  })
  const words = to === 'active' ? (later ? 'Schedule' : status === 'active' ? 'Go live now' : 'Publish') : to === 'unlisted' ? 'Make unlisted' : 'Move to draft'

  if (status === 'archived') {
    return (
      <Section ariaLabel="Status">
        <p className="text-sm"><span className="font-medium">Archived.</span> <span className="text-muted-foreground">Gone from your store.</span></p>
        <Button variant="secondary" className="w-full" disabled={pending} onClick={() => apply('draft')}>Unarchive</Button>
      </Section>
    )
  }
  return (
    <Section ariaLabel="Status">
      <Segmented label="Status" value={pick} options={CHOICES} onPick={setPick} className="flex w-full [&>button]:flex-1" />
      {to === 'active' ? (
        <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-6"><input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />Go live later</label>
      ) : null}
      {to === 'active' && later ? (
        <label className="flex flex-col gap-1.5 text-label font-medium">From, India time
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm md:h-9" />
        </label>
      ) : null}
      {needsReady && missing.length ? (
        <p id={missingId} tabIndex={-1} className="flex items-start gap-2 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">
          <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn-mark" />
          <span>Missing: {missing.map((m) => m.label.charAt(0).toLowerCase() + m.label.slice(1)).join(' · ')}</span>
        </p>
      ) : null}
      {feed.length ? <p className="text-small text-muted-foreground">Google and Meta also need: {feed.join(' · ')}</p> : null}
      {changed ? (
        // Blocked: still focusable (aria-disabled), drawn as a quiet button, never faded; a press takes focus to what is missing.
        <Button variant={blocked ? 'secondary' : 'primary'} className={cn('w-full', blocked && 'cursor-not-allowed')} aria-disabled={blocked || undefined}
          aria-describedby={blocked && missing.length ? missingId : undefined} busy={pending} disabled={dirty && !saveFirst}
          onClick={() => { if (blocked) document.getElementById(missingId)?.focus(); else if (to) apply(to) }}>{dirty ? `Save and ${words.toLowerCase()}` : words}</Button>
      ) : null}
    </Section>
  )
}
