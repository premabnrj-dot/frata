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
export function StatusCard({ productId, status, publishAt, ready, dirty, saveFirst }: { productId: string; status: Status; publishAt: string | null; ready: Readiness; dirty: boolean; saveFirst?: () => Promise<boolean> }) {
  const router = useRouter()
  const missingId = useId()
  const [pick, setPick] = useState<Pick>(status === 'archived' ? 'draft' : status)
  const [when, setWhen] = useState(toLocal(publishAt))
  const [later, setLater] = useState(!!publishAt)
  const toast = useToast()
  const [pending, start] = useTransition()
  const missing = ready.filter((r) => !r.ok)
  const needsReady = pick === 'active' || pick === 'unlisted'
  const at = pick === 'active' && later ? fromLocal(when) : null
  const changed = status === 'archived' || pick !== status || (pick === 'active' && at !== (publishAt ? new Date(publishAt).toISOString() : null))
  const blocked = (needsReady && missing.length > 0) || (pick === 'active' && later && !when)

  const apply = (to: Status) => start(async () => {
    if (dirty) { if (!saveFirst || !(await saveFirst())) return }
    const r = await setStatus(productId, to, to === 'active' ? at : null)
    if (!r.ok) { toast.error(r.error); return }
    toast.ok(to === 'active' && !at ? 'Published. Your shop shows it now.' : 'Done.'); router.refresh()
  })
  const words = pick === 'active' ? (later ? 'Schedule' : 'Publish') : pick === 'unlisted' ? 'Make unlisted' : 'Move to draft'

  if (status === 'archived') {
    return (
      <Section ariaLabel="Status">
        <p className="text-sm"><span className="font-medium">Archived.</span> <span className="text-muted-foreground">Gone from your shop.</span></p>
        <Button variant="secondary" className="w-full" disabled={pending} onClick={() => apply('draft')}>Unarchive</Button>
      </Section>
    )
  }
  return (
    <Section ariaLabel="Status">
      <Segmented label="Status" value={pick} options={CHOICES} onPick={setPick} className="flex w-full [&>button]:flex-1" />
      {pick === 'active' ? (
        <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-6"><input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />Go live later</label>
      ) : null}
      {pick === 'active' && later ? (
        <label className="flex flex-col gap-1.5 text-label font-medium">From, India time
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm md:h-9" />
        </label>
      ) : null}
      {needsReady && missing.length ? (
        <p id={missingId} className="flex items-start gap-2 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">
          <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn-mark" />
          <span>Missing: {missing.map((m) => m.label.charAt(0).toLowerCase() + m.label.slice(1)).join(' · ')}</span>
        </p>
      ) : null}
      {changed ? (
        <Button className={cn('w-full', blocked && 'opacity-45')} aria-disabled={blocked || undefined} aria-describedby={blocked && missing.length ? missingId : undefined}
          disabled={pending || (dirty && !saveFirst)} onClick={() => { if (!blocked) apply(pick) }}>{dirty ? `Save and ${words.toLowerCase()}` : words}</Button>
      ) : null}
    </Section>
  )
}
