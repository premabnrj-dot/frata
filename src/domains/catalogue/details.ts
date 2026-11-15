// =============================================================================
// FILE: src/domains/catalogue/details.ts — A PRODUCT'S DETAILS AS SHOPPERS READ THEM: the taxonomy's names for its
// attributes, in the merchant's order (gender and age group are left to the markup). Read by the product page and the
// Storefront API, so a website and the store never word a detail differently. Pure.
// =============================================================================

import { describeAttribute } from './taxonomy'

export function detailsOf(p: { attributes: Record<string, string[]> }): { name: string; value: string }[] {
  return Object.entries(p.attributes).flatMap(([h, ids]) => {
    const a = describeAttribute(h)
    if (!a || h === 'target-gender' || h === 'age-group') return []
    return [{ name: a.name, value: ids.map((id) => a.values.find((v) => v.id === id)?.name ?? '').filter(Boolean).join(', ') }]
  }).filter((d) => d.value)
}
