import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/banner.tsx — A LASTING CONDITION OF THE ACCOUNT (Neel N0b, § More components · Banners).
//
// At the top of every page until it is fixed; one at a time, the most urgent wins (the caller picks). bad (payment
// due) is an alert; warn, info and support are a status. The words first, the one action at the end of the line.
// The support visit's own strip (src/components/nav/support-banner.tsx) is the support tone, drawn in neel.css.
// =============================================================================

const TONE = {
  bad: 'bg-danger text-danger-text',
  warn: 'bg-warn text-warn-text',
  info: 'bg-info text-info-text',
  support: 'bg-support text-support-foreground',
} as const

export function Banner({ tone, title, children, action, className }: {
  tone: keyof typeof TONE
  title: ReactNode
  children?: ReactNode
  /** The one way to fix it: a link or a small button, at the end of the line. */
  action?: ReactNode
  className?: string
}) {
  return (
    // feedback-ok: a banner is a lasting condition of the account, drawn at the page's top (Neel § Banners), not an action's result
    <div role={tone === 'bad' ? 'alert' : 'status'} data-banner={tone}
      className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-mid px-3.5 py-2.5 text-sm', TONE[tone], className)}>
      <b className="font-semibold">{title}</b>
      {children ? <span>{children}</span> : null}
      {action ? <span className={cn('ml-auto font-medium [&_a]:underline-offset-2 [&_a:hover]:underline', tone === 'support' ? '[&_a]:text-bar-link' : '[&_a]:text-link')}>{action}</span> : null}
    </div>
  )
}
