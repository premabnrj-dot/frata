'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError } from '@/components/ui/field-error'
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
  const [error, setError] = useState<string | null>(null)
  const href = (q: Record<string, string>) => `${path}?${new URLSearchParams({ ...keep, ...q }).toString()}`
  const seg = 'inline-flex h-11 items-center rounded-sm px-3 text-sm md:h-7.5'
  const apply = () => {
    if (!from || !to) { setError('Pick both days.'); return }
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
    if (span < 1) { setError('The first day comes before the last.'); return }
    if (span > MAX_CUSTOM_DAYS) { setError(`Up to ${MAX_CUSTOM_DAYS} days.`); return }
    setOpen(false); router.push(href({ from, to }))
  }
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
      <nav aria-label="Period" className="flex min-w-0 max-w-full overflow-x-auto">
        <span className="inline-flex rounded-md border border-border bg-sunk p-0.5">
          {PERIOD_PRESETS.map((p) => {
            const current = choice.kind === 'preset' && choice.preset === p
            return <Link key={p} href={href({ period: p })} scroll={false} aria-current={current ? 'page' : undefined}
              className={cn(seg, 'shrink-0', current ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{WORDS[p]}</Link>
          })}
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-current={choice.kind === 'custom' ? 'page' : undefined}
            className={cn(seg, 'shrink-0', choice.kind === 'custom' ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>Custom</button>
        </span>
      </nav>
      <span className="text-sm whitespace-nowrap text-muted-foreground">{compare}</span>
      <Dialog open={open} onClose={() => setOpen(false)} title="Custom dates"
        actions={<><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" onClick={apply}>Show</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); apply() }} className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-label font-medium">From
            <input type="date" className={FIELD} value={from} max={to || today} onChange={(e) => { setFrom(e.target.value); setError(null) }} aria-describedby={error ? 'period-error' : undefined} />
          </label>
          <label className="flex flex-col gap-1.5 text-label font-medium">To
            <input type="date" className={FIELD} value={to} max={today} onChange={(e) => { setTo(e.target.value); setError(null) }} aria-describedby={error ? 'period-error' : undefined} />
          </label>
          <FieldError id="period-error" message={error} className="col-span-2" />
        </form>
      </Dialog>
    </div>
  )
}
