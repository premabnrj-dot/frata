'use client'

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { setNoticePrefAction } from '../../notices/actions'

export type PrefRow = { type: string; label: string; email: boolean | 'always' }

/** One row per kind of notice: in the console always; email locked on for required kinds, a switch for the rest. */
export function Prefs({ rows, readOnly }: { rows: PrefRow[]; readOnly: boolean }) {
  const [state, setState] = useState(rows)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const flip = (type: string, email: boolean) => start(async () => {
    setError(null)
    const r = await setNoticePrefAction({ type, email })
    if (r.ok) setState((s) => s.map((x) => (x.type === type ? { ...x, email } : x)))
    else setError(r.error)
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
      {error ? <p role="alert" className="px-4 pb-3 text-sm text-danger-text">{error}</p> : null}
    </>
  )
}
