// =============================================================================
// FILE: src/domains/checkout/discount-styles.ts — an offer's styles, the list alone. Its own file (page weight,
// 2026-11-23): the offer editor's browser code reads it, and importing discounts.ts for it shipped the discount maths
// and the whole GST rate table to every Offers page. discounts.ts re-exports it.
// =============================================================================

export const DISCOUNT_STYLES = ['order_off', 'free_shipping', 'pay_online', 'product_off', 'bxgy', 'free_gift'] as const
export type DiscountStyle = (typeof DISCOUNT_STYLES)[number]
