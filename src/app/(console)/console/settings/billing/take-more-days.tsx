'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { takeMoreDays } from './actions'

/** The owner's one 7-day extension (trials TR1·7). */
export function TakeMoreDays() {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => start(async () => { const r = await takeMoreDays(); setError(r.ok ? null : r.error) })}>Take 7 more days</Button>
      {error && <span role="alert" className="text-sm text-danger-text">{error}</span>}
    </span>
  )
}
