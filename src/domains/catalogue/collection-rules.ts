// =============================================================================
// FILE: src/domains/catalogue/collection-rules.ts
//
// AUTOMATIC COLLECTIONS: rules that keep a collection filled ("category is
// Kurtas, fabric is Chanderi, under ₹2,000, in stock"), matched all or any.
// Evaluated on product facts, not stored per product: a product that changes
// moves in or out by itself. Pure.
// =============================================================================

import { isWithin } from './category-id'

export type Rule =
  | { field: 'category'; value: string }
  | { field: 'attribute'; handle: string; value: string }
  | { field: 'colour_family'; value: string }
  | { field: 'price_below' | 'price_at_least'; value: number }
  | { field: 'in_stock' }
  | { field: 'tag'; value: string }

export type ProductFacts = { categoryId: string | null; attributes: Record<string, string[]>; colourFamilies: string[]; minPrice: number | null; inStock: boolean; tags: string[] }

export const MAX_RULES = 10

function one(r: Rule, p: ProductFacts): boolean {
  switch (r.field) {
    case 'category': return !!p.categoryId && isWithin(p.categoryId, r.value)
    case 'attribute': return (p.attributes[r.handle] ?? []).includes(r.value)
    case 'colour_family': return p.colourFamilies.includes(r.value)
    case 'price_below': return p.minPrice !== null && p.minPrice < r.value
    case 'price_at_least': return p.minPrice !== null && p.minPrice >= r.value
    case 'in_stock': return p.inStock
    case 'tag': return p.tags.map((t) => t.toLowerCase()).includes(r.value.toLowerCase())
  }
}

/** Every rule (match all) or any rule (match any). No rules: nothing — an empty automatic collection is never "everything". */
export function matches(rules: readonly Rule[], matchAll: boolean, p: ProductFacts): boolean {
  if (!rules.length) return false
  return matchAll ? rules.every((r) => one(r, p)) : rules.some((r) => one(r, p))
}

/** Rules as sent by the console, checked: unknown fields dropped, money as whole paise, at most MAX_RULES. */
export function cleanRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return []
  const out: Rule[] = []
  for (const r of raw.slice(0, MAX_RULES)) {
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.length <= 80 ? v.trim() : null)
    if (x.field === 'category' && str(x.value)) out.push({ field: 'category', value: str(x.value)! })
    else if (x.field === 'attribute' && str(x.handle) && str(x.value)) out.push({ field: 'attribute', handle: str(x.handle)!, value: str(x.value)! })
    else if (x.field === 'colour_family' && str(x.value)) out.push({ field: 'colour_family', value: str(x.value)! })
    else if ((x.field === 'price_below' || x.field === 'price_at_least') && Number.isInteger(x.value) && (x.value as number) > 0) out.push({ field: x.field, value: x.value as number })
    else if (x.field === 'in_stock') out.push({ field: 'in_stock' })
    else if (x.field === 'tag' && str(x.value)) out.push({ field: 'tag', value: str(x.value)! })
  }
  return out
}
