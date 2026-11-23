// The category packs, applied (plan docs/plans/2026-11-23-c1-category-packs.md). What readers import. Pack data reaches
// any browser chunk that uses this file, so files a client component imports (label.ts, size-charts.ts) never do, and
// this file imports no runtime value from outside packs/ (the charts themselves: ../starting-charts.ts).
// Side-effect free on purpose: every top-level value is a function or a /*#__PURE__*/ call, so a client file that
// imports policies/render.ts for a constant (policies/answers.ts) does not pull the packs into its chunk.
import { PACKS } from './list'
import { keysOf, registry, tilesOf } from './registry'

export type { Pack, ReturnLine } from './types'
export type { Tile } from './registry'

const R = /*#__PURE__*/ registry(PACKS)
/** What a shop can say it sells (shop_settings.sells and its CHECK, built from this list in schema.ts). */
export const SELL_KEYS = /*#__PURE__*/ keysOf(PACKS)
export type SellKey = (typeof SELL_KEYS)[number]
/** Sign-up's tiles (and C1b's Settings field), in tile order. */
export const SELL_TILES = /*#__PURE__*/ tilesOf(PACKS)
/** shop_settings.default_hsn at sign-up: the lowest-ranked pack's code. A prefill, never a fallback at checkout. */
export const startingHsn = (sells: readonly string[]) => R.startingHsn(sells)
/** Whether the shop sells clothing or footwear (size charts, the model line, Size and fit). */
export const sellsSized = (sells: readonly string[]) => R.sized(sells)
/** The starting chart keys, in the store's order, then One size (../starting-charts.ts makes them charts). */
export const chartKeys = (sells: readonly string[]) => R.chartKeys(sells)
/** Whether the editor asks what the pack says (label.ts) and Active needs it: set by what sign-up said. */
export const labelAsked = (sells: readonly string[]) => R.labelAsked(sells)
/** The returns page's condition sentences (policies/render.ts). */
export const returnLines = (sells: readonly string[]) => R.returnLines(sells)
