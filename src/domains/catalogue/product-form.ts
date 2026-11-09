// =============================================================================
// FILE: src/domains/catalogue/product-form.ts
//
// WHAT THE PRODUCT EDITOR SENDS, CHECKED. The editor types rupees; the shop
// stores paise (ADR-0004). One check for the editor and the save action.
// Also: whether a product is ready to show, in the merchant's words.
// =============================================================================

import { istDayKey } from '../time/day'
import { cleanGtin } from './gtin'
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
  values: string[]; price: string; compareAt: string; cost: string; stock: string; sku: string; gtin?: string
  whenOut?: WhenOutInput; shipsBy?: string; leadMin?: string; leadMax?: string; cap?: string
}
export type ColourInput = { value: string; family: string | null; hex: string | null; crop: { imageId: string; x: number; y: number; r: number } | null }
export type ProductInput = {
  title: string; description: string; typeId: string | null; modelHeight: string; modelSize: string
  options: Option[]; variants: VariantInput[]
  handle?: string; seoTitle?: string; seoDescription?: string; categoryId?: string | null
  attributes?: Record<string, string[]>; colours?: ColourInput[]; tags?: string[]
  /** GST (plan 2026-11-09-gst-core-and-categories § 2): HSN, the unit, the merchant's rate for a code the table lacks, made in. */
  tax?: TaxInput
  /** What the pack says (label.ts): asked of beauty and wellness shops. */
  label?: LabelInput
  /** Signal S3 (stories.ts): sent only when the editor shows the cards; undefined leaves the stored ones. */
  stories?: unknown; pairs?: unknown
}
export type TaxInput = { hsn: string; uqc: string; ownBps: string; origin: string }
export type CleanTax = { hsn: string | null; uqc: Uqc; gstBps: number | null; originCountry: string | null }
export type CleanVariant = {
  values: string[]; price: number; compareAt: number | null; unitCost: number | null; stock: number; sku: string | null; gtin: string | null
  whenOut: WhenOutInput; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; preorderCap: number | null
}
export type CleanProduct = Omit<ProductInput, 'options' | 'variants' | 'handle' | 'seoTitle' | 'seoDescription' | 'colours' | 'tags' | 'attributes' | 'categoryId' | 'tax' | 'label' | 'stories' | 'pairs'> & {
  options: Option[]; variants: CleanVariant[]; handle: string; seoTitle: string; seoDescription: string; categoryId: string | null
  attributes: Record<string, string[]>; colours: ColourInput[]; tags: string[]
  /** Undefined when the form sent no tax panel (the save leaves the stored values). */
  tax?: CleanTax
  /** Undefined when the form sent no label panel. */
  label?: Label
  /** Signal S3: undefined when the form sent no stories / pairs card. */
  stories?: Story[]; pairs?: string[]
}

/**
 * A product's tax, checked: an HSN is 4, 6 or 8 digits, at least `digits` (the turnover band's, rates.ts hsnDigitsFor);
 * a code the rate table lacks needs the merchant's own rate (a GST 2.0 rate), a code it knows takes none.
 */
export function cleanTax(t: TaxInput, now: Date, digits = 4): { ok: true; tax: CleanTax } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const hsn = t.hsn.replace(/\s/g, '')
  if (hsn && !HSN_SHAPE.test(hsn)) errors.hsn = 'An HSN code is 4, 6 or 8 digits.'
  else if (hsn && hsn.length < digits) errors.hsn = `At your turnover, invoices need ${digits} digits of HSN.`
  const own = t.ownBps.trim() ? Number(t.ownBps) : null
  const known = !!hsn && ruleOn(hsn, now) !== null
  if (hsn && !known && (own === null || !(OWN_RATES as readonly number[]).includes(own))) errors.ownBps = 'Choose its GST rate, as your CA advises.'
  if (!isUqc(t.uqc)) errors.uqc = 'Choose a unit.'
  const origin = t.origin.trim().replace(/\s+/g, ' ')
  if (origin.length > 60) errors.origin = 'Up to 60 characters.'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, tax: { hsn: hsn || null, uqc: t.uqc as Uqc, gstBps: known ? null : own, originCountry: origin || null } }
}

import { HSN_SHAPE, OWN_RATES, ruleOn } from '../tax/rates'
import { isUqc, type Uqc } from '../tax/units'
import { cleanLabel, type Label, type LabelInput } from './label'
import { cleanPairIds, cleanStories, type Story } from './stories'

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
  const gtins = new Map<string, string>()
  if (opts.ok) {
    for (const values of combinations(opts.options)) {
      const k = keyOf(values), v = byKey.get(k)
      const cell = (f: string) => `v:${k}:${f}`
      const price = parseRupees(v?.price ?? '')
      if (price === null) errors[cell('price')] = 'A price in rupees.'
      const compareAt = v?.compareAt.trim() ? parseRupees(v.compareAt) : null
      if (v?.compareAt.trim() && compareAt === null) errors[cell('compareAt')] = 'A price in rupees.'
      else if (compareAt !== null && price !== null && compareAt < price) errors[cell('compareAt')] = 'The M.R.P. can’t be below the price: never sell above M.R.P.'
      const unitCost = v?.cost.trim() ? parseRupees(v.cost) : null
      if (v?.cost.trim() && unitCost === null) errors[cell('cost')] = 'A cost in rupees, or empty.'
      const stockText = (v?.stock ?? '0').trim() || '0'
      if (!/^\d{1,6}$/.test(stockText)) errors[cell('stock')] = 'A whole number.'
      const sku = v?.sku.trim() || null
      if (sku && !/^[A-Za-z0-9._/-]{1,40}$/.test(sku)) errors[cell('sku')] = 'Letters, digits and - _ . / only.'
      else if (sku && skus.has(sku.toUpperCase())) errors[cell('sku')] = `Also used by ${skus.get(sku.toUpperCase())}.`
      if (sku) skus.set(sku.toUpperCase(), values.join(' / ') || 'this product')
      // The barcode (S2·3): optional; when typed, a real one (check digit) and not on two sizes.
      const gtinText = (v?.gtin ?? '').trim(), gtin = gtinText ? cleanGtin(gtinText) : null
      if (gtinText && !gtin) errors[cell('gtin')] = 'A barcode of 8, 12, 13 or 14 digits, as printed.'
      else if (gtin && gtins.has(gtin)) errors[cell('gtin')] = `Also used by ${gtins.get(gtin)}.`
      if (gtin) gtins.set(gtin, values.join(' / ') || 'this product')
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
      variants.push({ values, price: price ?? 0, compareAt, unitCost, stock: Number(stockText) || 0, sku, gtin, whenOut, shipsBy, leadMinDays, leadMaxDays, preorderCap })
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
  const tax = p.tax ? cleanTax(p.tax, now) : null
  if (tax && !tax.ok) Object.assign(errors, Object.fromEntries(Object.entries(tax.errors).map(([k, v]) => [`tax.${k}`, v])))
  const label = p.label ? cleanLabel(p.label) : null
  if (label && !label.ok) Object.assign(errors, Object.fromEntries(Object.entries(label.errors).map(([k, v]) => [`label.${k}`, v])))
  const stories = p.stories !== undefined ? cleanStories(p.stories) : null
  if (stories && !stories.ok) errors.stories = stories.error
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, product: { ...(tax?.ok ? { tax: tax.tax } : {}), ...(label?.ok ? { label: label.label } : {}), ...(stories?.ok ? { stories: stories.stories } : {}), ...(p.pairs !== undefined ? { pairs: cleanPairIds(p.pairs, '') } : {}), title, description: p.description.trim(), typeId: p.typeId, modelHeight: p.modelHeight.trim().slice(0, 30), modelSize: p.modelSize.trim().slice(0, 10), options: opts.ok ? opts.options : [], variants,
    handle, seoTitle, seoDescription, categoryId: p.categoryId ?? null, attributes: p.attributes ?? {}, colours, tags } }
}

export type Readiness = { label: string; ok: boolean }[]

/** What a product needs before shoppers see it — shown as a list, Publish stays off until all are met. */
export function readiness(p: { title: string; photos: number; prices: number[]; hasSizes: boolean; chartRows: number; anyBuyable: boolean
  /** A shop that charges GST: false until the product has an HSN with a known rate (or the merchant's own). Absent: not asked. */
  taxReady?: boolean
  /** A beauty or wellness shop: what the pack must say that is still missing (label.ts labelMissing). Absent: not asked. */
  labelMissing?: string[] }): Readiness {
  return [
    ...(p.labelMissing === undefined ? [] : [{ label: p.labelMissing.length ? `Its label: ${p.labelMissing.join(', ')}` : 'Its label details', ok: !p.labelMissing.length }]),
    ...(p.taxReady === undefined ? [] : [{ label: 'Its HSN code', ok: p.taxReady }]),
    { label: 'A name', ok: !!p.title.trim() },
    { label: 'At least one photo', ok: p.photos > 0 },
    { label: 'A price on every size and colour', ok: p.prices.length > 0 && p.prices.every((x) => x > 0) },
    { label: 'A size chart for its type', ok: !p.hasSizes || p.chartRows > 0 },
    { label: 'Something shoppers can buy (in stock, or taking pre-orders)', ok: p.anyBuyable },
  ]
}
