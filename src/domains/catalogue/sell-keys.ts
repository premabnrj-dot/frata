// What a shop can say it sells (shop_settings.sells): read from the category packs (src/domains/catalogue/packs, plan
// docs/plans/2026-11-23-c1-category-packs.md). src/lib/db/schema.ts re-exports SELL_KEYS as SELLS and builds the CHECK from it.
import { SELL_TILES, type SellKey } from './packs'
import { pure } from './packs/define'

export { SELL_KEYS, sellsSized, startingHsn, type SellKey } from './packs'

/** As sign-up shows them, in order. Debt: a test is its only reader once sign-up reads SELL_TILES (C1a·6). */
export const SELL_LABELS: readonly (readonly [SellKey, string])[] = /*#__PURE__*/ pure(() => SELL_TILES.map((t) => [t.key, t.label] as const))
