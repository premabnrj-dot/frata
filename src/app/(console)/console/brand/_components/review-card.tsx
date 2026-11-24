'use client'

import { Section } from '@/components/layout/section'
import { Facts } from '@/components/data/facts'
import { Badge } from '@/components/ui/badge'
import { useNow } from '@/components/time/now'
import { momentIN } from '@/lib/format-date'
import { BrandDecision } from '../../notices/brand-decision'

// =============================================================================
// A partner's waiting change, on Brand and on Brand › Checkout (one-address P1 mockup screen 4; four-screens mockup
// § 4): "Your partner's change", Sent, one row per changed part, and for the owner or a Manager the Notices row's own
// two buttons (BrandDecision: the same action, toasts and Undo). Anyone else who sees the page (staff, a support visit)
// reads the card without buttons. Who may answer is the server's (decidesBrand); `answer` only draws the buttons.
// =============================================================================

export function ReviewCard({ proposer, proposedAt, rows, answer, onDone }: {
  proposer: string | null; proposedAt: string; rows: [string, React.ReactNode][]
  /** The exact proposal the card shows, when the viewer answers it. */
  answer: { id: string; kind: 'brand' | 'checkout' } | null
  onDone?: () => void
}) {
  const now = useNow()
  const sent: [string, React.ReactNode] = ['Sent', `${proposer ?? 'Your partner'} · ${momentIN(proposedAt, now)}`]
  return (
    <Section className="border-warn-mark" title={<span className="flex flex-wrap items-center gap-2">Your partner’s change<Badge tone="warn">{answer ? 'Needs you' : 'Waiting for the owner'}</Badge></span>}>
      <Facts className="grid-cols-[116px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={[sent, ...rows]} />
      {answer && <BrandDecision id={answer.id} kind={answer.kind} onDone={onDone} className="flex flex-wrap gap-2" />}
    </Section>
  )
}
