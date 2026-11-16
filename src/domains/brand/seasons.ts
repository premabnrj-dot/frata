// =============================================================================
// FILE: src/domains/brand/seasons.ts — A SEASON: for a stretch of days a store's accent changes (Diwali, a sale), then
// stops by itself (one-address plan P1·1; Studio spec's "Make it festive"). Held as data in `brand_seasons`; no screen
// until a store asks (mockup § Your calls). A future season is never answered (the API, M5), and an answered season
// carries `until`. Pure: `now` is always passed.
// =============================================================================

import { contrast } from '@/domains/themes/contrast'
import { isHex, PAIRS, type BrandRecord, type Hex } from './record'

export type Season = { id: string; name: string; startsAt: string; endsAt: string | null; accent: Hex; on: Hex }

const t = (iso: string) => new Date(iso).getTime()

/** The season live at `now` (started, not ended); of several, the one that started last. Never a future one. */
export function liveSeason(seasons: readonly Season[], now: Date): Season | null {
  const n = now.getTime()
  const live = seasons.filter((s) => t(s.startsAt) <= n && (s.endsAt === null || n < t(s.endsAt)))
  return live.sort((a, b) => t(b.startsAt) - t(a.startsAt) || a.id.localeCompare(b.id))[0] ?? null
}

/** The record as shoppers see it at `now`: a live season's accent over the record's. */
export function withSeason(b: BrandRecord, s: Season | null): BrandRecord {
  return s ? { ...b, palette: { ...b.palette, accent: s.accent, on: s.on } } : b
}

/** What's wrong with a season, or null. Its accent passes the record's own checks against the record's background. */
export function seasonProblem(s: Pick<Season, 'name' | 'startsAt' | 'endsAt' | 'accent' | 'on'>, bg: Hex): string | null {
  if (!s.name.trim() || [...s.name].length > 40) return 'Name the season in 40 characters or fewer.'
  if (!isHex(s.accent) || !isHex(s.on)) return 'Type colours like #8C1D2C.'
  if (Number.isNaN(t(s.startsAt)) || (s.endsAt !== null && (Number.isNaN(t(s.endsAt)) || t(s.endsAt) <= t(s.startsAt)))) return 'End the season after it starts.'
  const onNeed = PAIRS.on.find(([r]) => r === 'accent')![1], bgNeed = PAIRS.accent.find(([r]) => r === 'bg')![1]
  if (contrast(s.on, s.accent) < onNeed || contrast(s.accent, bg) < bgNeed) return `The season’s accent needs ${Math.max(onNeed, bgNeed)}:1 with its text and the background.`
  return null
}
