'use client'

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { saveEmailAction } from './actions'

/** One email's on/off, saved at once; a refusal says why (no support email; a support visit). */
export function EmailSwitch({ kind, name, on, disabled }: { kind: string; name: string; on: boolean; disabled: boolean }) {
  const [v, setV] = useState(on)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {error ? <span role="alert" className="text-xs text-danger-text">{error}</span> : null}
      <Switch on={v} label={name} disabled={disabled || pending} onChange={(next) => start(async () => {
        setError(null)
        const r = await saveEmailAction(kind, null, next)
        if (r.ok) setV(next); else setError(r.error)
      })} />
    </span>
  )
}
