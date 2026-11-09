/** What a shop can say it sells (shop_settings.sells, its CHECK in drizzle/0070). One list: src/lib/db/schema.ts re-exports it as SELLS. */
export const SELL_KEYS = ['women', 'men', 'kids', 'ethnic', 'accessories', 'footwear', 'jewellery', 'beauty', 'wellness'] as const
export type SellKey = (typeof SELL_KEYS)[number]

/** As sign-up shows them, in order (all-categories brief § 1: W0 fashion first, then W1 beauty and wellness). */
export const SELL_LABELS: readonly (readonly [SellKey, string])[] = [
  ['women', 'Women'], ['men', 'Men'], ['kids', 'Kids'], ['ethnic', 'Ethnic wear'], ['footwear', 'Footwear'],
  ['accessories', 'Bags and accessories'], ['jewellery', 'Jewellery'], ['beauty', 'Beauty and personal care'], ['wellness', 'Wellness'],
]

/**
 * The HSN a new product starts with (shop_settings.default_hsn), from what the shop said it sells: the first match in
 * this order. A starting value the merchant changes per product, never a fallback at checkout.
 */
const STARTING: readonly (readonly [SellKey, string])[] = [
  ['ethnic', '6211'], ['women', '6204'], ['men', '6203'], ['kids', '6209'], ['footwear', '6403'],
  ['accessories', '4202'], ['jewellery', '7117'], ['beauty', '3304'], ['wellness', '3004'],
]
export function startingHsn(sells: readonly string[]): string {
  return STARTING.find(([k]) => sells.includes(k))?.[1] ?? '6211'
}
/** Whether the shop sells clothing or footwear (size charts, the model line, Size and fit). */
export const sellsSized = (sells: readonly string[]) => sells.length === 0 || sells.some((k) => ['women', 'men', 'kids', 'ethnic', 'footwear'].includes(k))
