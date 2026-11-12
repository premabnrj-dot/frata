// =============================================================================
// FILE: src/domains/catalogue/import/read.ts
//
// A SHEET → PRODUCT DRAFTS AND WHAT TO FIX (plan 2026-11-12-product-import PI·1 · 4; spec § Parsing rules). Pure. The
// browser reads the whole file here for the Check step; the server reads each chunk here again and writes only what
// this says (a member's browser is never trusted with the rules).
//
// Rules:
// - The editor's own check decides every product (cleanProduct): prices by parseRupees ("₹1,299", "Rs. 1299",
//   "1,299/-"; "1,2,99", a third decimal, zero or a negative are errors, never 0), stock, SKU and barcode shapes,
//   options, the M.R.P. never below the price, HSN digits for the shop's turnover. Its errors are told here as
//   row · column · what to fix, the column as the file names it.
// - A row may hold several sizes and colours ("S/M/L"): it is one variant per combination, sharing its price; a SKU
//   there gets each value's code ("KS-ANR" → "KS-ANR-S"); one barcode can't name several.
// - Every combination of a product's sizes and colours needs its row (a variant per combination, as the editor).
// - A SKU and a barcode are unique in the file: the later row names the earlier.
// - A sale price, when given, is the price, and the price column the M.R.P. (WooCommerce's Regular / Sale).
// - GST: a known HSN decides the rate (the file's GST column is then ignored); an unknown one needs a rate the law has
//   (0, 3, 5, 18 or 40%). Neither given: no tax yet (a registered shop can't publish it until it has one).
// - Shopify's single-variant "Title / Default Title" is no option.
// - A product with any problem is left out whole (design language: "Imports check before they write").
// =============================================================================

import { cleanProduct, type CleanVariant, type ProductInput, type VariantInput } from '../product-form'
import { combinations, handleFor, keyOf, type Option } from '../variants'
import { OWN_RATES, ownRatesText, ruleOn } from '../../tax/rates'
import { isSizeOption } from '../../storefront/picker'
import { htmlText, parseGst, parseStock, splitValues } from './cells'
import { FIELDS, type Field, type Mapping } from './fields'
import { groupRows, reader, type SheetRow } from './group'
import { CHUNK_BYTES, CHUNK_ROOM, rowBytes } from './limits'

export type Problem = { row: number; column: string; message: string }
export type ReadContext = { now: Date; hsnDigits: number; costs: boolean }
export type ProductRow = { description: string; hsn: string | null; uqc: string; gstBps: number | null; tags: string[] }
export type ImportDraft = { title: string; handle: string; options: Option[]; variants: CleanVariant[]; row: ProductRow }
export type ImportProduct = {
  key: string
  rows: number[]
  title: string
  /** The address it asks for (its Address cell, else its name's): with its SKUs, how it is found in the shop. */
  handle: string
  skus: string[]
  draft: ImportDraft | null
}
export type Read = { products: ImportProduct[]; problems: Problem[] }
/** SKUs (upper case) and barcodes already met, with their row: the earlier chunks' when a file is checked in parts. */
export type Seen = { skus: Map<string, number>; gtins: Map<string, number> }

const fail = (problems: Problem[], row: number, column: string, message: string) => problems.push({ row, column, message })
/** An echoed cell, short enough for a message (and the row's 4 kB of errors). */
export const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
/** The longest cell each field may hold: the rules read nothing longer (security review 2026-11-12: no regex sees a long cell). */
export const CELL_CAPS: Partial<Record<Field, number>> = {
  title: 200, handle: 200, size: 500, colour: 500, option1Value: 500, option2Value: 500, option3Value: 500, stock: 500,
  option1Name: 100, option2Name: 100, option3Name: 100, sku: 100, price: 100, sale: 100, compareAt: 100, cost: 100, barcode: 100,
  hsn: 100, gst: 100, tags: 1000, rowId: 100, parent: 100, kind: 100,
}
const code = (v: string) => v.toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'X'

/** `seen` carries SKUs and barcodes across a file read in parts; it is added to as rows are read. */
export function readImport(m: Mapping, rows: readonly SheetRow[], ctx: ReadContext, seen: Seen = { skus: new Map(), gtins: new Map() }): Read {
  const { get, has } = reader(m)
  const header = (f: Field) => { const i = m.fields.indexOf(f); return i >= 0 ? m.headers[i]! : FIELDS[f] }
  const problems: Problem[] = []
  const products: ImportProduct[] = []
  const { skus: skuAt, gtins: gtinAt } = seen

  for (const g of groupRows(m, rows)) {
    const mine: Problem[] = []
    const first = g.rows[0]!
    const pick = (f: Field) => { for (const r of g.rows) { const v = get(r, f); if (v) return v } return '' }
    const title = pick('title').slice(0, CELL_CAPS.title)
    const handle = handleFor(pick('handle').slice(0, CELL_CAPS.handle)) || handleFor(title)

    // A cell longer than its field allows leaves the product out before any rule reads it.
    for (const r of g.rows) for (const [i, f] of m.fields.entries()) {
      const cap = f ? CELL_CAPS[f] : undefined
      if (cap && (r.cells[i] ?? '').length > cap) fail(mine, r.n, m.headers[i]!, `Up to ${cap} characters`)
    }
    if (mine.length) {
      problems.push(...mine)
      products.push({ key: g.key, rows: g.rows.map((r) => r.n), title, handle, skus: [], draft: null })
      continue
    }

    // Options: the file's named options (Shopify, WooCommerce), then a Sizes and a Colours column.
    type Opt = { name: string; field: Field; split: 'size' | 'other' | 'none' }
    const opts: Opt[] = []
    for (const i of [1, 2, 3] as const) {
      const name = pick(`option${i}Name`), field = `option${i}Value` as Field
      if (!name) continue
      const values = g.variantRows.map((r) => get(r, field))
      if (i === 1 && /^title$/i.test(name) && values.every((v) => !v || /^default title$/i.test(v))) continue
      opts.push({ name, field, split: 'none' })
    }
    if (has('size') && !opts.some((o) => isSizeOption(o.name))) opts.push({ name: 'Size', field: 'size', split: 'size' })
    if (has('colour') && !opts.some((o) => /^colou?rs?$/i.test(o.name))) opts.push({ name: 'Colour', field: 'colour', split: 'other' })
    // The options this product has: those some row gives a value. A row that only lists values (WooCommerce's
    // variable row) sets their order.
    const lists = g.variantRows.map((r) => opts.map((o) => { const v = get(r, o.field); return o.split === 'none' ? (v ? [v] : []) : splitValues(v, o.split) }))
    const on = opts.map((_, i) => lists.some((l) => l[i]!.length > 0))
    const live = opts.filter((_, i) => on[i])
    const listed = live.map((o) => g.rows.filter((r) => !g.variantRows.includes(r)).flatMap((r) => splitValues(get(r, o.field))).map((v) => v.toLowerCase()))

    // Variants: each row once per combination of its values.
    const cells: (VariantInput & { row: number; sale: boolean })[] = []
    const rowOf = new Map<string, number>()
    for (const [j, r] of g.variantRows.entries()) {
      const own = lists[j]!.filter((_, i) => on[i])
      const miss = own.findIndex((l) => !l.length)
      if (miss >= 0) { fail(mine, r.n, header(live[miss]!.field), `Needs its ${clip(live[miss]!.name.toLowerCase(), 40)}`); continue }
      const combos = combinations(live.map((o, i) => ({ name: o.name, values: own[i]! })))
      const stock = parseStock(get(r, 'stock'))
      if (!stock) fail(mine, r.n, header('stock'), 'A whole number, or per size like S:4, M:6')
      const sale = get(r, 'sale')
      const sku = get(r, 'sku'), gtin = get(r, 'barcode')
      if (gtin && combos.length > 1) fail(mine, r.n, header('barcode'), `One barcode can't name ${combos.length} sizes and colours`)
      for (const values of combos) {
        const k = keyOf(values)
        if (rowOf.has(k)) { fail(mine, r.n, header(live[0]?.field ?? 'title'), values.length ? `${clip(values.join(' · '))} is also on row ${rowOf.get(k)}` : `This product is also on row ${rowOf.get(k)}`); continue }
        rowOf.set(k, r.n)
        const each = stock && 'per' in stock ? stock.per.get(values.find((v) => stock.per.has(v.toLowerCase()))?.toLowerCase() ?? '') ?? '0' : stock?.each ?? '0'
        cells.push({
          row: r.n, sale: !!sale, values,
          price: sale || get(r, 'price'), compareAt: sale ? get(r, 'compareAt') || get(r, 'price') : get(r, 'compareAt'),
          cost: ctx.costs ? get(r, 'cost') : '', stock: each,
          sku: sku && combos.length > 1 ? `${sku}-${values.map(code).join('-')}` : sku, gtin,
        })
      }
    }
    if (!g.variantRows.length) fail(mine, first.n, header('price'), 'Needs a price')
    if (g.rows.reduce((n, r) => n + rowBytes(m, r), 0) > CHUNK_BYTES - CHUNK_ROOM) fail(mine, first.n, header('description'), 'Too long to import: shorten its description')

    // The product's sizes and colours, a listed order first, then as they appear; every combination needs its row.
    const rank = (i: number, v: string) => { const at = listed[i]!.indexOf(v.toLowerCase()); return at < 0 ? Infinity : at }
    const options: Option[] = live.map((o, i) => {
      const seen = [...new Set(cells.map((c) => c.values[i]!))].map((v, at) => [v, at] as const)
      return { name: o.name, values: seen.sort((a, b) => rank(i, a[0]) - rank(i, b[0]) || a[1] - b[1]).map(([v]) => v) }
    })
    if (!mine.length && options.length) for (const values of combinations(options)) {
      if (!rowOf.has(keyOf(values))) { fail(mine, first.n, header(live[0]!.field), `No row for ${clip(values.join(' · '))}`); break }
    }

    // Tax: a known HSN decides; an unknown one needs one of the law's rates.
    const hsn = pick('hsn').replace(/\s/g, ''), gstCell = pick('gst')
    const known = !!hsn && ruleOn(hsn, ctx.now) !== null
    const bps = gstCell && !known ? parseGst(gstCell) : null
    if (gstCell && !known && (bps === null || !(OWN_RATES as readonly number[]).includes(bps))) fail(mine, first.n, header('gst'), `A GST rate of ${ownRatesText()}`)

    const tags = pick('tags') ? pick('tags').split(',').map((t) => t.trim()).filter(Boolean) : []
    const input: ProductInput = {
      title, description: htmlText(pick('description')), typeId: null, modelHeight: '', modelSize: '', handle, options, tags,
      variants: cells.map(({ row: _r, sale: _s, ...v }) => v),
      ...(hsn || gstCell ? { tax: { hsn, uqc: 'NOS', ownBps: bps === null ? '' : String(bps), origin: '' } } : {}),
    }
    const clean = mine.length ? null : cleanProduct(input, ctx.now, ctx.hsnDigits)
    if (clean && !clean.ok) for (const [k, message] of Object.entries(clean.errors)) {
      const v = /^v:(.*):(\w+)$/.exec(k)
      if (v) {
        const c = cells.find((x) => keyOf(x.values) === v[1])
        const f = v[2]!
        const col = f === 'price' ? header(c?.sale ? 'sale' : 'price') : f === 'compareAt' ? header(c?.sale && !has('compareAt') ? 'price' : 'compareAt')
          : f === 'gtin' ? header('barcode') : header(f as Field)
        const raw = f === 'price' ? c?.price : f === 'compareAt' ? c?.compareAt : f === 'cost' ? c?.cost : null
        const said = raw == null ? message : !raw.trim() ? 'Needs a price' : /^More than/.test(message) || /M\.R\.P\./.test(message) ? message : `"${clip(raw)}" isn't ${f === 'cost' ? 'a cost in rupees' : 'a price'}`
        fail(mine, c?.row ?? first.n, col, said)
      } else {
        const f: Field = k === 'title' ? 'title' : k === 'handle' ? 'handle' : k === 'description' ? 'description' : k === 'tags' ? 'tags'
          : k === 'tax.hsn' ? 'hsn' : k === 'tax.ownBps' ? (has('gst') ? 'gst' : 'hsn') : live[0]?.field ?? 'title'
        if (k === 'handle' && !title) continue
        fail(mine, first.n, header(f), k === 'tax.ownBps' ? `HSN ${clip(hsn, 20)} needs its GST rate: ${ownRatesText()}` : k === 'title' && !title ? 'Needs a product name' : message)
      }
    }

    // A SKU or barcode on another product in the file: the later product names the earlier row.
    if (!mine.length) for (const c of cells) {
      if (c.sku) { const at = skuAt.get(c.sku.toUpperCase()); if (at !== undefined) fail(mine, c.row, header('sku'), `${clip(c.sku)} is also on row ${at}`) }
      if (c.gtin) { const at = gtinAt.get(c.gtin); if (at !== undefined) fail(mine, c.row, header('barcode'), `Barcode ${clip(c.gtin)} is also on row ${at}`) }
    }
    for (const c of cells) {
      if (c.sku && !skuAt.has(c.sku.toUpperCase())) skuAt.set(c.sku.toUpperCase(), c.row)
      if (c.gtin && !gtinAt.has(c.gtin)) gtinAt.set(c.gtin, c.row)
    }

    const ok = !mine.length && clean?.ok ? clean.product : null
    problems.push(...mine)
    products.push({
      key: g.key, rows: g.rows.map((r) => r.n), title, handle, skus: cells.flatMap((c) => (c.sku ? [c.sku.toUpperCase()] : [])),
      draft: ok ? {
        title: ok.title, handle: ok.handle, options: ok.options, variants: ok.variants,
        row: { description: ok.description, hsn: ok.tax?.hsn ?? null, uqc: ok.tax?.uqc ?? 'NOS', gstBps: ok.tax?.gstBps ?? null, tags: ok.tags },
      } : null,
    })
  }
  problems.sort((a, b) => a.row - b.row)
  return { products, problems }
}
