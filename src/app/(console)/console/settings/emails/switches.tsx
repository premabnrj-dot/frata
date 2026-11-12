'use client'

import { useState, useTransition } from 'react'
import { useToast } from '@/components/ui/toast'
import { Switch } from '@/components/ui/switch'
import { saveEmailAction } from './actions'

/** One email's on/off, saved at once; a refusal says why (no support email; a support visit). */
export function EmailSwitch({ kind, name, on, disabled }: { kind: string; name: string; on: boolean; disabled: boolean }) {
  const [v, setV] = useState(on)
  const toast = useToast()
  const [pending, start] = useTransition()
  return (
    <span className="flex items-center gap-2">
      <Switch on={v} label={name} disabled={disabled || pending} onChange={(next) => start(async () => {
        const r = await saveEmailAction(kind, undefined, next)
        if (r.ok) setV(next); else toast.error(r.error)
      })} />
    </span>
  )
}
