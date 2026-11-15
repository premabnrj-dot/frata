import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/app/(admin)/admin/_components/needs-band.tsx — A WAITING TASK UNDER A HEADER (Neel N4, owner-approved
// mockup https://claude.ai/artifact/YPGo8SV7vqNu9vyCp5vCSQ). One band, its one action; it goes when the task is done.
// Someone who may not act sees the band and who decides instead of the button.
// =============================================================================

const TONE = { warn: 'bg-warn text-warn-text', bad: 'bg-danger text-danger-text', info: 'bg-info text-info-text' } as const

export function NeedsBand({ tone = 'warn', title, line, action, className }: {
  tone?: keyof typeof TONE
  /** The fact, said first: "The owner hasn't signed in." */
  title: string
  line?: ReactNode
  /** The one action; or the words saying who acts. */
  action?: ReactNode
  className?: string
}) {
  return (
    <section aria-label="Needs you" className={cn('flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:gap-4', TONE[tone], className)}>
      <p className="min-w-0 flex-1 text-sm"><b className="font-semibold">{title}</b>{line ? <> {line}</> : null}</p>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </section>
  )
}
