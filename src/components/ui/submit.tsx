'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { VariantProps } from 'class-variance-authority'
import { endNavigation, startNavigation } from '@/components/shell/nav-progress'
import { cn } from '@/lib/utils'
import { Button, button } from './button'

// =============================================================================
// FILE: src/components/ui/submit.tsx — A SERVER-ACTION FORM'S SUBMIT BUTTON THAT SAYS IT IS WORKING. A server-action
// form (Admin's every write) posts, the action redirects, and the page renders again: with a plain button nothing on
// screen moved for that whole round trip, so staff clicked again or thought Admin had hung (speed review 2026-11-11
// MED 1). While the form is pending the button refuses clicks (aria-disabled, so it keeps keyboard focus) and the top
// bar runs, as a link click does (design language: no loading.tsx; a top progress bar). The bar stops when the action
// settles, even on a redirect to the URL already showing. A transition that never settles (frata-gotchas: Next 15.5)
// gives the button back after 15 s rather than leaving it dead. The label stays: it names the outcome.
// Not for a GET form (useFormStatus is never pending on a native GET): use Button there.
// =============================================================================

const GIVE_BACK_MS = 15_000

export function Submit({ variant, size, className, children, onClick, ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & VariantProps<typeof button>) {
  const { pending } = useFormStatus()
  const [stale, setStale] = useState(false)
  const was = useRef(false)
  useEffect(() => {
    if (pending) {
      was.current = true
      setStale(false)
      startNavigation()
      const t = window.setTimeout(() => setStale(true), GIVE_BACK_MS)
      return () => window.clearTimeout(t)
    }
    if (was.current) { was.current = false; endNavigation() }
  }, [pending])
  const busy = pending && !stale
  return (
    <Button type="submit" variant={variant} size={size} className={cn('aria-disabled:cursor-not-allowed aria-disabled:opacity-50', className)} {...props}
      aria-disabled={busy || props.disabled || undefined} aria-busy={busy || undefined}
      onClick={(e) => { if (busy) { e.preventDefault(); return } onClick?.(e) }}>
      {children}
    </Button>
  )
}
