// =============================================================================
// FILE: src/domains/catalogue/import/group.ts
//
// ROWS → PRODUCTS' ROWS (plan 2026-11-12-product-import PI·1 · 4). A product is one row or many: Shopify's rows share
// a Handle, WooCommerce's variations name their Parent, and an Indian sheet repeats the name on each size (or leaves
// it blank under a merged cell). Pure; the browser and the server group the same rows the same way.
//
// Rules:
// - An empty row is skipped.
// - With an Address (Handle) column, its value is the product; a blank one continues the row above.
// - WooCommerce: a variation belongs to its Parent ("id:12" or the parent's SKU); every other row is its own product.
//   A "variable" row carries the product (name, description, attributes) and is never a size itself.
// - Otherwise rows with the same name (any case) are one product; a row with no name continues the row above.
// - A row is a size or colour (a variant) when it has any variant cell: a size, a colour, an option value, a SKU, a
//   price, stock, a barcode. A row with none only adds product cells (Shopify's photo-only rows).
// =============================================================================

import type { Field, Mapping } from './fields'

export type SheetRow = { n: number; cells: string[] }
export type Group = { key: string; rows: SheetRow[]; variantRows: SheetRow[] }

const VARIANT_CELLS: Field[] = ['size', 'colour', 'option1Value', 'option2Value', 'option3Value', 'sku', 'price', 'sale', 'compareAt', 'cost', 'stock', 'barcode']

/** A row's cell for a field ('' when the file has no such column). */
export function reader(m: Pick<Mapping, 'fields'>) {
  const at = new Map<Field, number>()
  m.fields.forEach((f, i) => { if (f && !at.has(f)) at.set(f, i) })
  return { get: (r: SheetRow, f: Field) => { const i = at.get(f); return i === undefined ? '' : (r.cells[i] ?? '').trim() }, has: (f: Field) => at.has(f) }
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** FNV-1a, 32 bits: a long key's tail, so two long names that share a beginning stay two products. */
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(36) }
/** A key fits import_rows.key (300 characters): up to 160 as written, then a hash of the whole. */
const bounded = (k: string) => (k.length > 160 ? `${k.slice(0, 150)}~${fnv(k)}` : k)

/** The file's products, in the order their first row appears. */
export function groupRows(m: Mapping, rows: readonly SheetRow[]): Group[] {
  const { get, has } = reader(m)
  const groups = new Map<string, Group>()
  const woo = m.source === 'woocommerce' && has('kind')
  // WooCommerce: a parent can be named by its id or its SKU.
  const alias = new Map<string, string>()
  if (woo) for (const r of rows) {
    const id = get(r, 'rowId'), sku = get(r, 'sku')
    if (id && sku && !/variation/i.test(get(r, 'kind'))) alias.set(`sku:${sku.toUpperCase()}`, `id:${id}`)
  }
  let last: string | null = null
  for (const r of rows) {
    if (r.cells.every((c) => !c.trim())) continue
    let key: string | null
    if (woo) {
      const parent = get(r, 'parent'), id = get(r, 'rowId'), sku = get(r, 'sku')
      if (/variation/i.test(get(r, 'kind')) && parent) {
        const ref = /^id:\s*(\d+)$/i.exec(parent)
        key = ref ? `id:${ref[1]}` : alias.get(`sku:${parent.toUpperCase()}`) ?? `sku:${parent.toUpperCase()}`
      } else key = id ? `id:${id}` : sku ? `sku:${sku.toUpperCase()}` : `row:${r.n}`
    } else if (has('handle')) key = get(r, 'handle') ? `h:${tidy(get(r, 'handle'))}` : get(r, 'title') && !last ? `t:${tidy(get(r, 'title'))}` : last
    else key = get(r, 'title') ? `t:${tidy(get(r, 'title'))}` : last
    key = bounded(key ?? `row:${r.n}`)
    last = key
    const g = groups.get(key) ?? { key, rows: [], variantRows: [] }
    g.rows.push(r)
    const productOnly = woo && /variable/i.test(get(r, 'kind'))
    if (!productOnly && VARIANT_CELLS.some((f) => get(r, f))) g.variantRows.push(r)
    groups.set(key, g)
  }
  return [...groups.values()]
}
