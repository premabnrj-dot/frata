// =============================================================================
// FILE: src/domains/catalogue/packs/registry.ts — the accessors every reader of "what a store sells" goes through
// (plan docs/plans/2026-11-23-c1-category-packs.md). Pure and generic over the list, so a test can hand it a list with
// a fixture pack and see the new pack flow through (C1c). Readers import index.ts, never a pack.
// =============================================================================

import type { PresetKey } from '../size-charts'
import type { Pack, ReturnLine } from './types'

/** A store that skipped "What do you sell?" is treated as selling these. Their labels follow these packs, so none is asked. */
export const UNSAID = ['ethnic', 'women', 'men'] as const
/** The starting HSN when no pack the store sells names one. */
export const FALLBACK_HSN = '6211'

type Keys<P extends readonly Pack[]> = { readonly [I in keyof P]: P[I]['key'] }
export type Tile<K extends string = string> = { readonly key: K; readonly label: string; readonly order: number; readonly icon: string }

/** The keys, in list order (the CHECK's order), typed as the literal keys so z.enum and the CHECK take them. */
export const keysOf = <const P extends readonly Pack[]>(packs: P) => packs.map((p) => p.key) as unknown as Keys<P>
/** The tiles, in tile order. */
export const tilesOf = <const P extends readonly Pack[]>(packs: P) =>
  [...packs].sort((a, b) => a.tile.order - b.tile.order).map((p) => ({ key: p.key, ...p.tile })) as readonly Tile<P[number]['key']>[]

export function registry<const P extends readonly Pack[]>(packs: P) {
  const byKey = new Map<string, Pack>(packs.map((p) => [p.key, p]))
  /** The packs a store sells, in the store's own order; an empty list is UNSAID, an unknown key is ignored. */
  const of = (sells: readonly string[]): Pack[] => (sells.length ? sells : UNSAID).flatMap((k) => byKey.get(k) ?? [])
  return {
    keys: keysOf(packs),
    tiles: tilesOf(packs),
    /** shop_settings.default_hsn at sign-up: the lowest-ranked pack's code. A prefill, never a fallback at checkout. */
    startingHsn: (sells: readonly string[]): string =>
      of(sells).reduce<Pack | null>((best, p) => (!best || p.startingHsn.rank < best.startingHsn.rank ? p : best), null)?.startingHsn.code ?? FALLBACK_HSN,
    /** Whether the store sells clothing or footwear (size charts, the model line, Size and fit). */
    sized: (sells: readonly string[]): boolean => of(sells).some((p) => p.sized),
    /** The starting charts, in the store's order, then One size, each once. */
    chartKeys: (sells: readonly string[]): PresetKey[] => [...new Set<PresetKey>([...of(sells).flatMap((p) => p.charts), 'one_size'])],
    /** Whether the editor asks what the pack says (label.ts), and Active needs it. */
    labelAsked: (sells: readonly string[]): boolean => of(sells).some((p) => p.label),
    /** The returns page's condition sentences: each distinct line once, by rank. */
    returnLines: (sells: readonly string[]): string[] => {
      const lines = new Map<string, ReturnLine>(of(sells).map((p) => [p.returns.text, p.returns]))
      return [...lines.values()].sort((a, b) => a.rank - b.rank).map((l) => l.text)
    },
  }
}
