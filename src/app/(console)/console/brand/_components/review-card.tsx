'use client'

import dynamic from 'next/dynamic'
import { Segmented } from '@/components/ui/segmented'

// =============================================================================
// A partner's waiting change, on Brand and on Brand › Checkout (one-address P1 mockup screen 4; four-screens mockup
// § 4): "Your partner's change", Sent, one row per changed part, and for the owner or a Manager the Notices row's own
// two buttons (BrandDecision: the same action, toasts and Undo). Anyone else who sees the page (staff, a support visit)
// reads the card without buttons. Who may answer is the server's (decidesBrand); `answer` only draws the buttons.
// =============================================================================

export { previewed, type Version } from '@/domains/brand/compare'
import type { Version } from '@/domains/brand/compare'

/** The card (partner-change.tsx) loads when a change waits; the server still draws it in the page's first HTML. */
export const ReviewCard = dynamic(() => import('./partner-change').then((m) => m.ReviewCard))

/** The preview's Live | Waiting switch, while a change waits (four-screens § 4, call 8): compare before answering. */
export function VersionSwitch({ value, onPick }: { value: Version; onPick: (v: Version) => void }) {
  return <Segmented label="Live or waiting" value={value} options={[['live', 'Live'], ['waiting', 'Waiting']]} onPick={onPick} />
}
