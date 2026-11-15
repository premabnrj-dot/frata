import { entryState, type Dated } from './schedule'

// =============================================================================
// FILE: src/domains/content/bar.ts — THE ONE ORDER RULE for the store's announcement bar (owner decision 7, spec
// 2026-11-14 § Content kinds): a live offer in the bar shows first; else the live written bar that started last (a
// sale's bar covers a standing one without deleting it; ties: the last saved). One bar, never two. Read by the store's
// frame and by the console's chips. Pure.
// =============================================================================

export type WrittenBar = Dated & { id: string; createdAt: Date; updatedAt: Date }
export type Bar<T extends WrittenBar> = { kind: 'offer' } | { kind: 'written'; entry: T } | null

const startOf = (b: WrittenBar) => (b.startsAt ?? b.createdAt).getTime()

/** The written bars that would show without an offer, first the one that shows. */
export function writtenOrder<T extends WrittenBar>(written: readonly T[], now: Date): T[] {
  return written.filter((b) => entryState(b, now) === 'live')
    .sort((a, b) => startOf(b) - startOf(a) || b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? -1 : 1))
}

export function barFor<T extends WrittenBar>(offerLive: boolean, written: readonly T[], now: Date): Bar<T> {
  if (offerLive) return { kind: 'offer' }
  const first = writtenOrder(written, now)[0]
  return first ? { kind: 'written', entry: first } : null
}

/** What the console says beside a written bar. */
export type BarChip = 'live' | 'after_offer' | 'behind' | 'scheduled' | 'ended' | 'stopped'
export function barChip<T extends WrittenBar>(entry: T, offerLive: boolean, written: readonly T[], now: Date): BarChip {
  const s = entryState(entry, now)
  if (s !== 'live') return s
  if (offerLive) return 'after_offer'
  return writtenOrder(written, now)[0]?.id === entry.id ? 'live' : 'behind'
}
