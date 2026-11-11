'use client'

import { useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import type { VariantProps } from 'class-variance-authority'
import { startNavigation } from '@/components/shell/nav-progress'
import { Button, button } from './button'

// =============================================================================
// FILE: src/components/ui/submit.tsx — A FORM'S SUBMIT BUTTON THAT SAYS IT IS WORKING. A server-action form (Admin's
// every write) posts, the action redirects, and the page renders again: with a plain button nothing on screen moved
// for that whole round trip, so staff clicked again or thought Admin had hung (speed review 2026-11-11 MED 1). While
// the form is pending the button is disabled (a second click can't post twice) and the top bar runs, as a link click
// does (design language: no loading.tsx; a top progress bar). The label stays: it names the outcome.
// =============================================================================

export function Submit({ variant, size, className, children, ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & VariantProps<typeof button>) {
  const { pending } = useFormStatus()
  useEffect(() => { if (pending) startNavigation() }, [pending])
  return (
    <Button type="submit" variant={variant} size={size} className={className} {...props} disabled={pending || props.disabled} aria-busy={pending || undefined}>
      {children}
    </Button>
  )
}
