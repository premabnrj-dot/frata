// =============================================================================
// FILE: src/domains/catalogue/product-form.ts
//
// WHAT THE PRODUCT EDITOR SENDS, CHECKED. The editor types rupees; the shop
// stores paise (ADR-0004). One check for the editor and the save action.
// Also: whether a product is ready to show, in the merchant's words.
// =============================================================================

import { istDayKey } from '../time/day'
import { cleanOptions, combinations, handleFor, keyOf, type Option } from './variants'

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

export type WhenOutInput = 'stop' | 'preorder' | 'made_to_order'
export type VariantInput = {
  values: string[]; price: string; compareAt: string; cost: string; stock: string; sku: string
  whenOut?: WhenOutInput; shipsBy?: string; leadMin?: string; leadMax?: string; cap?: string
}
export type ColourInput = { value: string; family: string | null; hex: string | null; crop: { imageId: string; x: number; y: number; r: number } | null }
export type ProductInput = {
  title: string; description: string; typeId: string | null; modelHeight: string; modelSize: string
  options: Option[]; variants: VariantInput[]
  handle?: string; seoTitle?: string; seoDescription?: string; categoryId?: string | null
  attributes?: Record<string, string[]>; colours?: ColourInput[]; tags?: string[]
}
export type CleanVariant = {
  values: string[]; price: number; compareAt: number | null; unitCost: number | null; stock: number; sku: string | null
  whenOut: WhenOutInput; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; preorderCap: number | null
}
export type CleanProduct = Omit<ProductInput, 'options' | 'variants' | 'handle' | 'seoTitle' | 'seoDescription' | 'colours' | 'tags' | 'attributes' | 'categoryId'> & {
  options: Option[]; variants: CleanVariant[]; handle: string; seoTitle: string; seoDescription: string; categoryId: string | null
  attributes: Record<string, string[]>; colours: ColourInput[]; tags: string[]
}

export const HANDLE_SHAPE = /^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Errors keyed "title", "options", or "v:<values>:<field>" for one grid cell. */
export function cleanProduct(p: ProductInput, now: Date): { ok: true; product: CleanProduct } | { ok: false; errors: Record<string, string> } {
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
      // When it runs out: pre-order needs a ship-by date within a year (Google's limit); made to order needs lead days.
      const whenOut: WhenOutInput = v?.whenOut === 'preorder' || v?.whenOut === 'made_to_order' ? v.whenOut : 'stop'
      let shipsBy: string | null = null, leadMinDays: number | null = null, leadMaxDays: number | null = null, preorderCap: number | null = null
      if (whenOut === 'preorder') {
        const d = (v?.shipsBy ?? '').trim(), today = istDayKey(now), max = istDayKey(new Date(now.getTime() + 365 * 86400000))
        if (!DATE.test(d) || d <= today || d > max) errors[cell('shipsBy')] = 'A ship-by date after today, within a year.'
        else shipsBy = d
        const cap = (v?.cap ?? '').trim()
        if (cap && !/^\d{1,6}$/.test(cap)) errors[cell('cap')] = 'A whole number, or empty for no limit.'
        else preorderCap = cap ? Number(cap) : null
      }
      if (whenOut === 'made_to_order') {
        const a = Number((v?.leadMin ?? '').trim()), b = Number((v?.leadMax ?? '').trim() || a)
        if (!Number.isInteger(a) || a < 1 || a > 120 || !Number.isInteger(b) || b < a || b > 120) errors[cell('lead')] = 'Days to make it: 1 to 120, the second not below the first.'
        else { leadMinDays = a; leadMaxDays = b }
      }
      variants.push({ values, price: price ?? 0, compareAt, unitCost, stock: Number(stockText) || 0, sku, whenOut, shipsBy, leadMinDays, leadMaxDays, preorderCap })
    }
  }
  const handle = (p.handle ?? '').trim().toLowerCase() || handleFor(title)
  if (!HANDLE_SHAPE.test(handle) || handle.includes('--')) errors.handle = 'Lowercase letters, digits and hyphens, like linen-kurta-set.'
  const seoTitle = (p.seoTitle ?? '').trim(), seoDescription = (p.seoDescription ?? '').trim()
  if (seoTitle.length > 200) errors.seoTitle = 'Up to 200 characters.'
  if (seoDescription.length > 400) errors.seoDescription = 'Up to 400 characters.'
  const tags = [...new Set((p.tags ?? []).map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean))]
  if (tags.length > 20 || tags.some((t) => t.length > 40)) errors.tags = 'Up to 20 tags of up to 40 characters.'
  // Colours: only values the colour option has; a family from the standard list (checked by the caller), #rrggbb, or a crop inside the photo.
  const colourOpt = opts.ok ? opts.options.find((o) => /^colou?rs?$/i.test(o.name)) : undefined
  const colours = (p.colours ?? []).filter((c) => colourOpt?.values.includes(c.value)).map((c) => ({
    value: c.value, family: c.family || null, hex: c.hex && /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex.toLowerCase() : null,
    crop: c.crop && /^[0-9a-f-]{36}$/.test(c.crop.imageId) && [c.crop.x, c.crop.y].every((n) => n >= 0 && n <= 1) && c.crop.r >= 0.03 && c.crop.r <= 0.5 ? c.crop : null,
  }))
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, product: { title, description: p.description.trim(), typeId: p.typeId, modelHeight: p.modelHeight.trim().slice(0, 30), modelSize: p.modelSize.trim().slice(0, 10), options: opts.ok ? opts.options : [], variants,
    handle, seoTitle, seoDescription, categoryId: p.categoryId ?? null, attributes: p.attributes ?? {}, colours, tags } }
}

export type Readiness = { label: string; ok: boolean }[]

/** What a product needs before shoppers see it — shown as a list, Publish stays off until all are met. */
export function readiness(p: { title: string; photos: number; prices: number[]; hasSizes: boolean; chartRows: number; anyBuyable: boolean }): Readiness {
  return [
    { label: 'A name', ok: !!p.title.trim() },
    { label: 'At least one photo', ok: p.photos > 0 },
    { label: 'A price on every size and colour', ok: p.prices.length > 0 && p.prices.every((x) => x > 0) },
    { label: 'A size chart for its type', ok: !p.hasSizes || p.chartRows > 0 },
    { label: 'Something shoppers can buy (in stock, or taking pre-orders)', ok: p.anyBuyable },
  ]
}
