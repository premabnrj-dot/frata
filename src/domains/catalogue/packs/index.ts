// The category packs, applied (plan docs/plans/2026-11-23-c1-category-packs.md). What readers import. Pack data reaches
// any browser chunk that imports this file, so files a client component imports (label.ts, size-charts.ts) never do.
import { PRESETS, type Preset } from '../size-charts'
import { PACKS } from './list'
import { registry } from './registry'

export type { Pack, ReturnLine } from './types'
export type { Tile } from './registry'

const R = registry(PACKS)
/** What a shop can say it sells (shop_settings.sells and its CHECK, built from this list in schema.ts). */
export const SELL_KEYS = R.keys
export type SellKey = (typeof SELL_KEYS)[number]
export const { tiles: SELL_TILES, startingHsn, sized: sellsSized, chartKeys, labelAsked, returnLines } = R

/** The starting size charts a shop gets, from what it said it sells (all of the common ones if it skipped). */
export const presetsFor = (sells: readonly string[]): Preset[] => chartKeys(sells).map((k) => PRESETS[k])
