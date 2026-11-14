import type { ReactNode } from 'react'
import type { Paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Numbers that must line up: tabular figures (font-num: Inter in the console, mono outside it), right-aligned by the caller.
 * Every ₹ and every order number goes through these, so the rule cannot be
 * forgotten at a call site.
 */
export function Money({ paise, decimals, className }: { paise: Paise; decimals?: boolean; className?: string }) {
  return (
    <span className={cn('font-num', paise < 0 && 'text-danger-text', className)}>
      <MoneyParts text={formatInr(paise, { decimals })} />
    </span>
  )
}

export function Numeric({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-num', className)}>{children}</span>
}

/** "−₹1,234.50" as its parts: the symbol and the paise a step quieter in Neel (neel.css .money-sym, .money-paise; the
 * mockup's § Components), the rupees as they are. The text a person or a screen reader gets is unchanged. */
function MoneyParts({ text }: { text: string }) {
  const m = text.match(/^(−?₹)([^.]*)(\.\d+)?$/)
  if (!m) return <>{text}</>
  return <><span className="money-sym">{m[1]}</span>{m[2]}{m[3] ? <span className="money-paise">{m[3]}</span> : null}</>
}
