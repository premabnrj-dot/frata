'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { takeMoreDays } from './actions'

/** The owner's one 7-day extension (trials TR1·7). */
export function TakeMoreDays() {
  const [busy, start] = useTransition()
  const toast = useToast()
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => start(async () => { const r = await takeMoreDays(); if (!r.ok) toast.error(r.error) })}>Take 7 more days</Button>
    </span>
  )
}
