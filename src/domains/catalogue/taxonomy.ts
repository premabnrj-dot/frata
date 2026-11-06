// =============================================================================
// FILE: src/domains/catalogue/taxonomy.ts
//
// CATEGORIES AND THEIR DETAILS. One category per product, from Shopify's open
// product taxonomy (MIT; extract in ./taxonomy/apparel.json, made by
// scripts/data/taxonomy.mjs from tag v2026-10). Fixed: merchants pick, never
// edit; a new release is adopted on purpose. Each category brings the
// attributes it asks for, and maps to a Google category for feeds.
// Frata adds what Indian fashion needs and the standard lacks (occasion, more
// crafts and fabrics, fit, what a set includes), each mapped to the nearest
// standard value so Google and Meta still read it. Pure (data only).
// =============================================================================

import data from './taxonomy/apparel.json'

type Raw = { tag: string; categories: [string, string, string | null, string, string[], number | null][]; attributes: Record<string, [string, [string, string][]]> }
const T = data as unknown as Raw

export const TAXONOMY_TAG = T.tag

export type Category = { id: string; name: string; parentId: string | null; path: string; attributeHandles: string[]; googleId: number | null }
const CATS = new Map<string, Category>(T.categories.map(([id, name, parentId, path, attributeHandles, googleId]) => [id, { id, name, parentId, path, attributeHandles, googleId }]))

export const categoryById = (id: string | null | undefined): Category | null => (id ? CATS.get(id) ?? null : null)

export { isWithin } from './category-id'
import { isWithin } from './category-id'

/** Words shoppers and merchants use that the taxonomy spells differently. */
const SYNONYMS: Record<string, string> = { saree: 'sari', sarees: 'saris', kurti: 'kurta', kurtis: 'kurtas', lehnga: 'lehenga', ghagra: 'lehenga', salwar: 'salwar', anarkali: 'kurta', jutti: 'flats', juttis: 'flats', mojari: 'flats', coord: 'outfit sets', 'co-ord': 'outfit sets', tee: 't-shirts' }

/** Up to `limit` categories whose name or path has every word typed, leaf names first. */
export function searchCategories(q: string, limit = 12): Category[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).map((w) => SYNONYMS[w] ?? w)
  if (!words.length) return POPULAR.map((id) => CATS.get(id)!).filter(Boolean)
  const scored: [number, Category][] = []
  for (const c of CATS.values()) {
    const name = c.name.toLowerCase(), path = c.path.toLowerCase()
    if (!words.every((w) => path.includes(w))) continue
    // Best: the name starts with what was typed; then the name contains it; then only the path does. Shorter names first.
    const rank = words.every((w) => name.startsWith(w) || name.includes(' ' + w)) ? (name.startsWith(words[0]!) ? 0 : 1) : words.every((w) => name.includes(w)) ? 2 : 3
    scored.push([rank * 1000 + name.length, c])
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map((x) => x[1])
}

/** Shown before anything is typed. */
export const POPULAR = ['aa-1-23-7', 'aa-1-23-10', 'aa-1-23-2-1', 'aa-1-23-2-2', 'aa-2-31-4']

export type AttributeValue = { id: string; name: string; frata?: true; mapsTo?: string }
export type Attribute = { handle: string; name: string; values: AttributeValue[]; frata?: true; forFeeds?: true }

/** Colour and size are the product's options (variants), so they are not asked again as details. */
const FROM_VARIANTS = new Set(['color', 'size'])
/** Required by Google for apparel free listings in every country (Merchant Center, live 2026). */
export const FEED_REQUIRED = new Set(['target-gender', 'age-group'])

const std = (handle: string, name: string) => T.attributes[handle]?.[1].find(([, n]) => n === name)?.[0]
const add = (handle: string, rows: [string, string, string][]): AttributeValue[] => rows.map(([id, name, to]) => {
  const mapsTo = std(handle, to)
  return { id: `frata:${id}`, name, frata: true as const, ...(mapsTo ? { mapsTo } : {}) }
})
const frataValues: Record<string, AttributeValue[]> = {
  fabric: add('fabric', [['chanderi', 'Chanderi', 'Silk'], ['khadi', 'Khadi', 'Cotton'], ['mul', 'Mul cotton', 'Cotton'], ['banarasi', 'Banarasi silk', 'Silk'], ['kota', 'Kota doria', 'Cotton']]),
  'embellishment-technique': add('embellishment-technique', [['ikat', 'Ikat', 'Tie-dye'], ['chikankari', 'Chikankari', 'Embroidery'], ['kalamkari-hand', 'Hand-painted kalamkari', 'Hand-painted'], ['gota', 'Gota patti', 'Appliqué']]),
}
const FRATA_ATTRIBUTES: Attribute[] = [
  { handle: 'frata-occasion', name: 'Occasion', frata: true, values: ['Festive', 'Wedding', 'Daily wear', 'Office', 'Party', 'Vacation'].map((n) => ({ id: `frata:${n.toLowerCase().replace(/\s+/g, '-')}`, name: n, frata: true })) },
  { handle: 'frata-fit', name: 'Fit', frata: true, values: ['Regular', 'Relaxed', 'Slim', 'Flared', 'Straight', 'A-line'].map((n) => ({ id: `frata:${n.toLowerCase()}`, name: n, frata: true })) },
]
const SETS: Attribute = { handle: 'frata-set-includes', name: 'Set includes', frata: true, values: ['Kurta only', 'Kurta and dupatta', 'Kurta and pants', 'Kurta, pants and dupatta', 'Sari and blouse piece', 'Lehenga, blouse and dupatta'].map((n) => ({ id: `frata:${n.toLowerCase().replace(/[^a-z]+/g, '-')}`, name: n, frata: true })) }

/** The details a category asks for: its standard attributes (with Frata values added), then Frata's own. */
export function attributesFor(categoryId: string | null): Attribute[] {
  const c = categoryById(categoryId)
  if (!c) return []
  const out: Attribute[] = c.attributeHandles.filter((h) => !FROM_VARIANTS.has(h) && T.attributes[h]).map((h) => {
    const [name, vals] = T.attributes[h]!
    return { handle: h, name, values: [...vals.map(([id, n]) => ({ id, name: n })), ...(frataValues[h] ?? [])], ...(FEED_REQUIRED.has(h) ? { forFeeds: true as const } : {}) }
  })
  if (isWithin(c.id, 'aa-1')) {
    out.push(...FRATA_ATTRIBUTES)
    if (!c.attributeHandles.includes('embellishment-technique')) out.push({ handle: 'embellishment-technique', name: 'Craft', values: [...(T.attributes['embellishment-technique']?.[1] ?? []).map(([id, n]) => ({ id, name: n })), ...frataValues['embellishment-technique']!] })
    if (isWithin(c.id, 'aa-1-23') && !c.attributeHandles.includes('set-items-included')) out.push(SETS)
  }
  return out
}

/** Colour families for filters and feeds: the taxonomy's standard colours. */
export const COLOUR_FAMILIES: AttributeValue[] = (T.attributes.color?.[1] ?? []).map(([id, name]) => ({ id, name }))
export const colourFamilyName = (id: string | null | undefined) => COLOUR_FAMILIES.find((c) => c.id === id)?.name ?? null

/** Checks values sent for a category: drops attributes it does not ask for and values not in their list. */
export function cleanAttributes(categoryId: string | null, sent: Record<string, string[]>): Record<string, string[]> {
  const allowed = new Map(attributesFor(categoryId).map((a) => [a.handle, new Set(a.values.map((v) => v.id))]))
  const out: Record<string, string[]> = {}
  for (const [h, vals] of Object.entries(sent)) {
    const ok = allowed.get(h)
    if (!ok) continue
    const v = [...new Set(vals)].filter((x) => ok.has(x)).slice(0, 20)
    if (v.length) out[h] = v
  }
  return out
}

/** Any attribute by handle, with Frata's added values (for naming a saved value outside a category). */
export function describeAttribute(handle: string): Attribute | null {
  const own = [...FRATA_ATTRIBUTES, SETS].find((a) => a.handle === handle)
  if (own) return own
  const raw = T.attributes[handle]
  return raw ? { handle, name: raw[0], values: [...raw[1].map(([id, name]) => ({ id, name })), ...(frataValues[handle] ?? [])] } : null
}
