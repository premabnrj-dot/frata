// The import's pure rules (plan 2026-11-12-product-import PI·1 · 4) on the fixtures the plan names: a Shopify export,
// a WooCommerce export, our template, a Hindi sheet and the shop stress test's broken sheet (CSV and .xlsx, read as
// the browser reads them: papaparse, read-excel-file).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readSheet } from 'read-excel-file/universal'
import { matchColumns, remap, sourceOf, type Mapping } from '../fields'
import { readImport, type ReadContext } from '../read'
import { sheetOf, type Sheet } from '../sheet'
import { csvSheet, fixture } from './fixtures'

const NOW = new Date('2026-11-12T06:00:00Z')
const ctx: ReadContext = { now: NOW, hsnDigits: 4, costs: true }
const read = (s: Sheet, m: Mapping = matchColumns(s.headers, { costs: true }), c = ctx) => readImport(m, s.rows, c)
const named = (m: Mapping) => Object.fromEntries(m.fields.flatMap((f, i) => (f ? [[f, m.headers[i]]] : [])))

describe('a Shopify export', () => {
  const s = csvSheet('shopify.csv')
  const m = matchColumns(s.headers, { costs: true })
  it('is told by its columns and matched by its headers', () => {
    expect(m.source).toBe('shopify')
    expect(named(m)).toMatchObject({ handle: 'Handle', title: 'Title', description: 'Body (HTML)', option1Name: 'Option1 Name', option2Value: 'Option2 Value', sku: 'Variant SKU',
      stock: 'Variant Inventory Qty', price: 'Variant Price', compareAt: 'Variant Compare At Price', barcode: 'Variant Barcode', cost: 'Cost per item', tags: 'Tags' })
    expect(m.fields[m.headers.indexOf('Type')]).toBeNull() // its product type, not WooCommerce's row type
    expect(m.fields[m.headers.indexOf('Image Src')]).toBeNull() // photos by link are PI·3
  })
  it('groups rows by Handle, skips photo-only rows, reads Default Title as no option', () => {
    const r = read(s)
    expect(r.problems).toEqual([])
    expect(r.products.map((p) => [p.handle, p.rows])).toEqual([['linen-kurta-set', [2, 3, 4, 5, 6]], ['silk-dupatta', [7]]])
    const [linen, silk] = r.products.map((p) => p.draft!)
    expect(linen!.options).toEqual([{ name: 'Size', values: ['S', 'M'] }, { name: 'Colour', values: ['Indigo', 'Rust'] }])
    expect(linen!.variants.map((v) => [v.values, v.price, v.compareAt, v.unitCost, v.stock, v.sku])).toEqual([
      [['S', 'Indigo'], 249900, 299900, 90000, 4, 'KS-LIN-S-IND'], [['S', 'Rust'], 249900, 299900, 90000, 0, 'KS-LIN-S-RUS'],
      [['M', 'Indigo'], 249900, 299900, 90000, 6, 'KS-LIN-M-IND'], [['M', 'Rust'], 259900, 299900, 95000, 2, 'KS-LIN-M-RUS'],
    ])
    expect(linen!.row).toMatchObject({ description: 'Hand-loomed linen.\nWash cold & dry in shade.', tags: ['linen', 'summer'], hsn: null, gstBps: null })
    expect(silk!.options).toEqual([])
    expect(silk!.variants).toMatchObject([{ values: [], price: 129900, gtin: '4006381333931', stock: 12 }])
  })
  it('leaves costs out for a member who does not see them', () => {
    const staff = matchColumns(s.headers, { costs: false })
    expect(staff.fields).not.toContain('cost')
    expect(read(s, staff, { ...ctx, costs: false }).products[0]!.draft!.variants.every((v) => v.unitCost === null)).toBe(true)
    expect(remap(staff, staff.headers.indexOf('Cost per item'), 'cost', { costs: false })).toBe(staff)
  })
})

describe('a WooCommerce export', () => {
  const s = csvSheet('woocommerce.csv')
  it('groups variations under their parent by id or SKU, the variable row setting the size order', () => {
    expect(sourceOf(s.headers)).toBe('woocommerce')
    const r = read(s)
    expect(r.problems).toEqual([])
    const [kurta, stole] = r.products.map((p) => p.draft!)
    expect(kurta).toMatchObject({ title: 'Block print kurta', options: [{ name: 'Size', values: ['S', 'M', 'L'] }], row: { description: 'Hand block printed in Sanganer.', tags: ['cotton', 'block print'] } })
    expect(kurta!.variants.map((v) => [v.values[0], v.sku, v.stock, v.price])).toEqual([['S', 'BPK-S', 5, 189900], ['M', 'BPK-M', 0, 189900], ['L', 'BPK-L', 3, 189900]])
    // A sale price is the price; the regular one its M.R.P.
    expect(stole!.variants).toMatchObject([{ values: [], price: 49900, compareAt: 69900, stock: 10, sku: 'CST-1' }])
  })
})

describe('our template', () => {
  const s = csvSheet('template.csv')
  it('reads ₹ and commas, S/M/L and S-M-L-XL in a cell, stock per size, a rate for an HSN the table lacks', () => {
    const m = matchColumns(s.headers, { costs: true })
    expect(named(m)).toMatchObject({ title: 'Name', size: 'Sizes', colour: 'Colours', price: 'Price', compareAt: 'MRP', cost: 'Cost', stock: 'Stock', sku: 'SKU', hsn: 'HSN code', gst: 'GST rate' })
    const r = read(s)
    expect(r.problems).toEqual([])
    const [anarkali, coord, stole] = r.products.map((p) => p.draft!)
    expect(anarkali!.variants.map((v) => [v.values, v.price, v.stock, v.sku, v.unitCost])).toEqual([[['S'], 249900, 4, 'KS-ANR-S', 110000], [['M'], 249900, 6, 'KS-ANR-M', 110000], [['L'], 249900, 2, 'KS-ANR-L', 110000]])
    expect(anarkali!.row).toMatchObject({ hsn: '6204', gstBps: null })
    expect(coord!.options).toEqual([{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }, { name: 'Colour', values: ['Indigo', 'Rust'] }])
    expect(coord!.variants).toHaveLength(8)
    expect(coord!.variants.every((v) => v.price === 319900 && v.compareAt === 349900 && v.stock === 3 && v.sku === null)).toBe(true)
    expect(stole).toMatchObject({ options: [], row: { hsn: null, gstBps: 500 }, variants: [{ price: 129900, gtin: '8901234567890' }] })
  })
})

describe('a Hindi sheet', () => {
  it('reads Item / MRP / Qty, gives Indian names Latin addresses, and keeps "Free size" one size', () => {
    const s = csvSheet('hindi.csv')
    const r = read(s)
    expect(r.problems).toEqual([])
    expect(r.products.map((p) => [p.title, p.handle])).toEqual([['चंदेरी दुपट्टा', 'chanderi-dupatta'], ['बनारसी साड़ी', 'banarasi-sari'], ['ਫੁਲਕਾਰੀ ਦੁਪੱਟਾ', 'phulakari-dupata']])
    expect(r.products[0]!.draft).toMatchObject({ options: [{ name: 'Size', values: ['Free size'] }, { name: 'Colour', values: ['Rani', 'Haldi'] }] })
    expect(r.products[1]!.draft!.variants).toMatchObject([{ values: [], price: 1250000, stock: 2 }])
  })
})

describe("the stress test's broken sheet", () => {
  const expectBroken = (s: Sheet) => {
    const m = matchColumns(s.headers, { costs: true })
    expect(named(m)).toEqual({ title: 'Item', size: 'Size', price: 'MRP', stock: 'Qty', sku: 'SKU', cost: 'Purchase price' })
    const r = read(s, m)
    expect(r.problems).toEqual([
      { row: 7, column: 'MRP', message: '"Rs 1,2,99" isn\'t a price' },
      { row: 11, column: 'SKU', message: 'KS-BPK-M is also on row 5' },
    ])
    expect(r.products).toHaveLength(11)
    expect(r.products.filter((p) => !p.draft).map((p) => p.title)).toEqual(['Kota doria saree', 'Ajrakh shirt'])
    const bpk = r.products.find((p) => p.title === 'Block print kurta')!
    expect(bpk.rows).toEqual([5, 6])
    expect(bpk.draft!.variants.map((v) => [v.values, v.stock])).toEqual([[['M'], 5], [['L'], 0]])
  }
  it('as CSV: two products left out, each named by row and column', () => expectBroken(csvSheet('stress.csv')))
  it('as .xlsx: the same, numbers as numbers', async () => {
    const grid = await readSheet(new Blob([readFileSync(fixture('stress.xlsx'))]))
    const s = sheetOf(grid)
    if (!s.ok) throw new Error(s.error)
    expect(s.sheet.rows[0]!.cells.slice(0, 6)).toEqual(['Anarkali kurta set', 'S/M/L', '₹2,499', 'S:4, M:6, L:2', 'KS-ANR', '1100'])
    expectBroken(s.sheet)
  })
})

describe('what to fix, in words', () => {
  const sheet = (rows: string[][]): Sheet => ({ headers: rows[0]!, rows: rows.slice(1).map((cells, i) => ({ n: i + 2, cells })) })
  const problems = (rows: string[][]) => read(sheet(rows)).problems.map((p) => `${p.row} ${p.column}: ${p.message}`)
  it('a missing price, zero, a third decimal, the M.R.P. below the price, a bad stock', () => {
    expect(problems([['Name', 'Price', 'MRP', 'Stock'], ['A', '', '', '1'], ['B', '0', '', '1'], ['C', '999.999', '', '1'], ['D', '999', '899', '1'], ['E', '999', '', 'lots']])).toEqual([
      '2 Price: Needs a price', '3 Price: More than ₹0.', '4 Price: "999.999" isn\'t a price', '5 MRP: The M.R.P. can’t be below the price: never sell above M.R.P.', '6 Stock: A whole number, or per size like S:4, M:6',
    ])
  })
  it('a grid with a size missing, a size twice, a barcode for many sizes, a GST rate the law has not', () => {
    expect(problems([['Name', 'Size', 'Colour', 'Price', 'Barcode', 'GST'], ['A', 'S', 'Red', '9', '', ''], ['A', 'M', 'Blue', '9', '', ''], ['B', 'S', '', '9', '', ''], ['B', 'S', '', '9', '', ''],
      ['C', 'S/M', '', '9', '4006381333931', ''], ['D', '', '', '9', '', '12%']])).toEqual([
      '2 Size: No row for S · Blue', '5 Size: S is also on row 4', '6 Barcode: One barcode can\'t name 2 sizes and colours', '7 GST: A GST rate of 0, 3, 5, 18 or 40%',
    ])
  })
  it('a name continues under a merged cell; a row with no name and nothing above it needs one', () => {
    const r = read(sheet([['Name', 'Size', 'Price'], ['', 'S', '9'], ['Kurta', 'S', '9'], ['', 'M', '9']]))
    expect(r.problems.map((p) => p.message)).toEqual(['Needs a product name'])
    expect(r.products.find((p) => p.title === 'Kurta')!.draft!.options).toEqual([{ name: 'Size', values: ['S', 'M'] }])
  })
  it('an HSN the table lacks needs its rate; a known one ignores the column; too few digits for the turnover', () => {
    const s = sheet([['Name', 'Price', 'HSN', 'GST'], ['A', '9', '9999', ''], ['B', '9', '6204', '12%'], ['C', '9', '6204', '']])
    expect(read(s).problems.map((p) => `${p.row} ${p.column}: ${p.message}`)).toEqual(['2 GST: HSN 9999 needs its GST rate: 0, 3, 5, 18 or 40%'])
    expect(read(s, undefined, { ...ctx, hsnDigits: 6 }).problems.map((p) => p.row)).toEqual([2, 3, 4])
  })
})
