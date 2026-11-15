'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError, useFieldErrors } from '@/components/ui/field-error'
import { MAX_CUSTOM_DAYS, PERIOD_PRESETS, type PeriodChoice, type Preset } from '@/domains/analytics/period'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/charts/period-picker.tsx — ONE PERIOD PICKER PER PAGE (Neel N1b, kit § Period and comparison).
// The presets are links (the period lives in the address: Back works, a link can be shared); Custom opens a dialog with
// two days (at most 92: MAX_CUSTOM_DAYS). What every figure is compared with is said beside it, as words.
// =============================================================================

const WORDS: Record<Preset, string> = { today: 'Today', '7': '7 days', '30': '30 days', month: 'This month' }

export function PeriodPicker({ path, choice, compare, today, keep = {} }: {
  path: string; choice: PeriodChoice; compare: string
  /** Today's IST day key: the last day a range may end on. */
  today: string
  /** Other parts of the address to keep (none on Analytics today). */
  keep?: Record<string, string>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(choice.kind === 'custom' ? choice.from : '')
  const [to, setTo] = useState(choice.kind === 'custom' ? choice.to : today)
  const scope = useRef<HTMLFormElement>(null)
  const formId = useId()
  const fe = useFieldErrors({ scope, noun: 'date' })
  const href = (q: Record<string, string>) => `${path}?${new URLSearchParams({ ...keep, ...q }).toString()}`
  // The Segmented control's look (src/components/ui/segmented.tsx); these are links, as the period lives in the address.
  const seg = 'inline-flex min-h-11 items-center rounded-[calc(var(--r-mid)-3px)] px-3 text-label font-medium transition-colors duration-fast ease-standard md:min-h-[30px]'
  const apply = () => {
    if (!from) { fe.set({ from: 'Pick the first day.' }); return }
    if (!to) { fe.set({ to: 'Pick the last day.' }); return }
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
    if (span < 1) { fe.set({ to: 'The last day comes after the first.' }); return }
    if (span > MAX_CUSTOM_DAYS) { fe.set({ to: `Up to ${MAX_CUSTOM_DAYS} days.` }); return }
    setOpen(false); router.push(href({ from, to }))
  }
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
      <nav aria-label="Period" className="flex min-w-0 max-w-full overflow-x-auto">
        <span className="inline-flex gap-0.5 rounded-mid border border-line-soft bg-sunk p-[3px]">
          {PERIOD_PRESETS.map((p) => {
            const current = choice.kind === 'preset' && choice.preset === p
            return <Link key={p} href={href({ period: p })} scroll={false} aria-current={current ? 'page' : undefined}
              className={cn(seg, 'shrink-0', current ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{WORDS[p]}</Link>
          })}
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-pressed={choice.kind === 'custom'} aria-current={choice.kind === 'custom' ? 'page' : undefined}
            className={cn(seg, 'shrink-0', choice.kind === 'custom' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>Custom</button>
        </span>
      </nav>
      <span className="text-sm whitespace-nowrap text-muted-foreground max-md:hidden">{compare}</span>
      <Dialog open={open} onClose={() => setOpen(false)} title="Custom dates"
        actions={<><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form={formId}>Show</Button></>}>
        <form id={formId} ref={scope} noValidate onSubmit={(e) => { e.preventDefault(); apply() }} className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-label font-medium">From
            <input type="date" name="from" className={FIELD} value={from} max={to || today} onChange={(e) => { setFrom(e.target.value); fe.clear('from') }} {...fe.props('from')} />
            <FieldError name="from" message={fe.errors.from} />
          </label>
          <label className="flex flex-col gap-1.5 text-label font-medium">To
            <input type="date" name="to" className={FIELD} value={to} min={from || undefined} max={today} onChange={(e) => { setTo(e.target.value); fe.clear('to') }} {...fe.props('to')} />
            <FieldError name="to" message={fe.errors.to} />
          </label>
        </form>
      </Dialog>
    </div>
  )
}
