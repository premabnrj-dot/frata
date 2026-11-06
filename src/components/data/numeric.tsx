import type { ReactNode } from 'react'
import type { Paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Numbers that must line up: mono, tabular, right-aligned by the caller.
 * Every ₹ and every order number goes through these, so the rule cannot be
 * forgotten at a call site.
 */
export function Money({ paise, decimals, className }: { paise: Paise; decimals?: boolean; className?: string }) {
  return (
    <span className={cn('font-mono tabular-nums', paise < 0 && 'text-danger-text', className)}>
      {formatInr(paise, { decimals })}
    </span>
  )
}

export function Numeric({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{children}</span>
}
