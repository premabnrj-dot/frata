'use client'

import { useState, useTransition } from 'react'
import { useToast } from '@/components/ui/toast'
import { Switch } from '@/components/ui/switch'
import { setNoticePrefAction } from '../../notices/actions'

export type PrefRow = { type: string; label: string; email: boolean | 'always' }

/** One row per kind of notice: in the console always; email locked on for required kinds, a switch for the rest. */
export function Prefs({ rows, readOnly }: { rows: PrefRow[]; readOnly: boolean }) {
  const [state, setState] = useState(rows)
  const toast = useToast()
  const [pending, start] = useTransition()
  const flip = (type: string, email: boolean) => start(async () => {
    const r = await setNoticePrefAction({ type, email })
    if (r.ok) setState((s) => s.map((x) => (x.type === type ? { ...x, email } : x)))
    else toast.error(r.error)
  })
  return (
    <>
      <ul className="divide-y divide-border">
        {state.map((r) => (
          <li key={r.type} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>{r.label}</span>
            {r.email === 'always'
              ? <span className="text-muted-foreground">Always emailed</span>
              : <Switch on={r.email} label={`Email: ${r.label}`} disabled={pending || readOnly} onChange={(v) => flip(r.type, v)} />}
          </li>
        ))}
      </ul>
    </>
  )
}
