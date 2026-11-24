'use client'

import { Segmented } from '@/components/ui/segmented'
import type { Version } from '@/domains/brand/compare'

// Apart from review-card.tsx (O2a·9): the switch and `previewed` are read on every Brand page, the card only while a
// partner's change waits, so the card loads with next/dynamic and these stay.
export { previewed, type Version } from '@/domains/brand/compare'

/** The preview's Live | Waiting switch, while a change waits (four-screens § 4, call 8): compare before answering. */
export function VersionSwitch({ value, onPick }: { value: Version; onPick: (v: Version) => void }) {
  return <Segmented label="Live or waiting" value={value} options={[['live', 'Live'], ['waiting', 'Waiting']]} onPick={onPick} />
}
