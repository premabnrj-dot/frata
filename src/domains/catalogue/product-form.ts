// =============================================================================
// FILE: src/domains/catalogue/product-form.ts
//
// WHAT THE PRODUCT EDITOR SENDS, CHECKED. The editor types rupees; the shop
// stores paise (ADR-0004). One check for the editor and the save action.
// Also: whether a product is ready to show, in the merchant's words.
// =============================================================================

import { cleanOptions, combinations, keyOf, type Option } from './variants'

/** "2,490" or "2490.50" → 249050 paise; null when it is not a price. */
export function parseRupees(text: string): number | null {
  const t = text.replace(/[,₹\s]/g, '')
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null
  const [r, p = ''] = t.split('.')
  return Number(r) * 100 + Number(p.padEnd(2, '0'))
}

/** 249050 → "2490.50", 249000 → "2490": what the editor shows in a price box. */
export function rupeesText(paise: number | null): string {
  if (paise === null) return ''
  const r = Math.floor(paise / 100), p = paise % 100
  return p ? `${r}.${String(p).padStart(2, '0')}` : String(r)
}

export type VariantInput = { values: string[]; price: string; compareAt: string; cost: string; stock: string; sku: string }
export type ProductInput = {
  title: string; description: string; typeId: string | null; modelHeight: string; modelSize: string
  options: Option[]; variants: VariantInput[]
}
export type CleanVariant = { values: string[]; price: number; compareAt: number | null; unitCost: number | null; stock: number; sku: string | null }
export type CleanProduct = Omit<ProductInput, 'options' | 'variants'> & { options: Option[]; variants: CleanVariant[] }

/** Errors keyed "title", "options", or "v:<values>:<field>" for one grid cell. */
export function cleanProduct(p: ProductInput): { ok: true; product: CleanProduct } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const title = p.title.trim().replace(/\s+/g, ' ')
  if (!title) errors.title = 'Your product needs a name.'
  else if (title.length > 140) errors.title = 'Up to 140 characters.'
  if (p.description.length > 5000) errors.description = 'Up to 5,000 characters.'
  const opts = cleanOptions(p.options)
  if (!opts.ok) errors.options = opts.error
  const byKey = new Map(p.variants.map((v) => [keyOf(v.values.map((x) => x.trim().replace(/\s+/g, ' '))), v]))
  const variants: CleanVariant[] = []
  const skus = new Map<string, string>()
  if (opts.ok) {
    for (const values of combinations(opts.options)) {
      const k = keyOf(values), v = byKey.get(k)
      const cell = (f: string) => `v:${k}:${f}`
      const price = parseRupees(v?.price ?? '')
      if (price === null) errors[cell('price')] = 'A price in rupees.'
      const compareAt = v?.compareAt.trim() ? parseRupees(v.compareAt) : null
      if (v?.compareAt.trim() && compareAt === null) errors[cell('compareAt')] = 'A price in rupees.'
      else if (compareAt !== null && price !== null && compareAt <= price) errors[cell('compareAt')] = 'Higher than the price, or empty.'
      const unitCost = v?.cost.trim() ? parseRupees(v.cost) : null
      if (v?.cost.trim() && unitCost === null) errors[cell('cost')] = 'A cost in rupees, or empty.'
      const stockText = (v?.stock ?? '0').trim() || '0'
      if (!/^\d{1,6}$/.test(stockText)) errors[cell('stock')] = 'A whole number.'
      const sku = v?.sku.trim() || null
      if (sku && !/^[A-Za-z0-9._/-]{1,40}$/.test(sku)) errors[cell('sku')] = 'Letters, digits and - _ . / only.'
      else if (sku && skus.has(sku.toUpperCase())) errors[cell('sku')] = `Also used by ${skus.get(sku.toUpperCase())}.`
      if (sku) skus.set(sku.toUpperCase(), values.join(' / ') || 'this product')
      variants.push({ values, price: price ?? 0, compareAt, unitCost, stock: Number(stockText) || 0, sku })
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, product: { title, description: p.description.trim(), typeId: p.typeId, modelHeight: p.modelHeight.trim().slice(0, 30), modelSize: p.modelSize.trim().slice(0, 10), options: opts.ok ? opts.options : [], variants } }
}

export type Readiness = { label: string; ok: boolean }[]

/** What a product needs before shoppers see it — shown as a list, Publish stays off until all are met. */
export function readiness(p: { title: string; photos: number; prices: number[]; hasSizes: boolean; chartRows: number; anyStock: boolean }): Readiness {
  return [
    { label: 'A name', ok: !!p.title.trim() },
    { label: 'At least one photo', ok: p.photos > 0 },
    { label: 'A price on every size and colour', ok: p.prices.length > 0 && p.prices.every((x) => x > 0) },
    { label: 'A size chart for its type', ok: !p.hasSizes || p.chartRows > 0 },
    { label: 'Something in stock', ok: p.anyStock },
  ]
}
