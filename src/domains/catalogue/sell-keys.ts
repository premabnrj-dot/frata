// What a shop can say it sells (shop_settings.sells): read from the category packs (src/domains/catalogue/packs, plan
// docs/plans/2026-11-23-c1-category-packs.md). src/lib/db/schema.ts re-exports SELL_KEYS as SELLS and builds the CHECK from it.
export { SELL_KEYS, sellsSized, startingHsn, type SellKey } from './packs'
