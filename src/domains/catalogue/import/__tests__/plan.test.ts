// What an import will do (plan.ts), the chunks it sends, and the rows-to-fix file (fix-file.ts), on the stress sheet.
import { describe, expect, it } from 'vitest'
import { matchColumns } from '../fields'
import { csvCell, rowsToFix } from '../fix-file'
import { CHUNK_BYTES, compactMapping, MAX_PRODUCTS } from '../limits'
import { capRefusal, checkedOf, chunkRows, fileChunks, planImport } from '../plan'
import { readImport } from '../read'
import { sheetOf } from '../sheet'
import { csvSheet } from './fixtures'

const ctx = { now: new Date('2026-11-12T06:00:00Z'), hsnDigits: 4, costs: true }

describe('planning the stress sheet', () => {
  const s = csvSheet('stress.csv')
  const m = matchColumns(s.headers, ctx)
  const r = readImport(m, s.rows, ctx)
  it('counts new, already in the shop (by SKU in any case, or address), and left out', () => {
    const p = planImport(r.products, { handles: new Set(['linen-co-ord']), skus: new Set(['KS-ANR-M']) })
    expect([p.fresh.length, p.inShop.length, p.leftOut.length]).toEqual([7, 2, 2])
    expect(p.inShop.map((x) => x.title)).toEqual(['Anarkali kurta set', 'Linen co-ord'])
    expect(p.variants).toBe(1 + 2 + 1 + 2 + 1 + 3 + 4)
  })
  it('refuses past the shop caps', () => {
    expect(capRefusal({ products: 9, variants: 20 }, { products: MAX_PRODUCTS - 9, variants: 0 })).toBeNull()
    expect(capRefusal({ products: 10, variants: 20 }, { products: MAX_PRODUCTS - 9, variants: 0 })).toBe('Your shop holds up to 600 products: this adds 10 to your 591. Split the file.')
    expect(capRefusal({ products: 1, variants: 20 }, { products: 0, variants: 1790 })).toBe('Your shop holds up to 1,800 sizes and colours: this adds 20 to your 1790. Split the file.')
  })
  it('chunks whole products, mapped cells only, and the server reads a chunk to the same products', () => {
    const chunks = chunkRows(m, s.rows, r.products)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.map((x) => x.cells.length)).toEqual(s.rows.map(() => 6)) // Supplier and Notes stay home
    const again = readImport(compactMapping(m), chunks[0]!, ctx)
    expect(again.products.map((p) => p.draft)).toEqual(r.products.map((p) => p.draft))
    expect(again.problems).toEqual(r.problems)
    // The browser chunks from the grouping alone, to the same chunks.
    expect(fileChunks(m, s.rows)).toEqual(chunks)
  })
  it('the Check step\'s reading: each product\'s state and preview, problems only for what is left out, no cost', () => {
    const c = checkedOf(r, { handles: new Set(), skus: new Set(['KS-ANR-M']) })
    expect(c.products.map((p) => p.state)).toEqual(['in_shop', 'new', 'new', 'new', 'left_out', 'new', 'new', 'new', 'left_out', 'new', 'new'])
    expect(c.products[1]).toEqual({ key: 't:चंदेरी दुपट्टा', rows: [3], title: 'चंदेरी दुपट्टा', handle: 'chanderi-dupatta', state: 'new', variants: 1, values: 'Free size', price: 89900, stock: 20 })
    expect(c.problems.map((p) => p.row)).toEqual([7, 11])
    expect(JSON.stringify(c)).not.toMatch(/cost|110000/i)
  })
  it('a SKU met in an earlier chunk is named on the later row (seen carried across)', () => {
    const seen = { skus: new Map<string, number>(), gtins: new Map<string, number>() }
    const head = readImport(compactMapping(m), fileChunks(m, s.rows)[0]!.slice(0, 4), ctx, seen)
    expect(head.problems).toEqual([])
    const tail = readImport(compactMapping(m), fileChunks(m, s.rows)[0]!.slice(4), ctx, seen)
    expect(tail.problems).toContainEqual({ row: 11, column: 'SKU', message: 'KS-BPK-M is also on row 5' })
  })
  it('packs many products into chunks under the limit, never splitting one', () => {
    const big = Array.from({ length: 900 }, (_, i) => [`Kurta ${Math.floor(i / 3)}`, ['S', 'M', 'L'][i % 3]!, '1299', '4', `K-${i}`, 'x'.repeat(800)])
    const sheet = sheetOf([['Name', 'Size', 'Price', 'Stock', 'SKU', 'Description'], ...big])
    if (!sheet.ok) throw new Error(sheet.error)
    const bm = matchColumns(sheet.sheet.headers, ctx)
    const read = readImport(bm, sheet.sheet.rows, ctx)
    const chunks = chunkRows(bm, sheet.sheet.rows, read.products)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThanOrEqual(CHUNK_BYTES)
      const names = new Set(c.map((x) => x.cells[0]))
      for (const other of chunks.filter((o) => o !== c)) expect(other.some((x) => names.has(x.cells[0]))).toBe(false)
    }
    expect(chunks.flat().length).toBe(900)
  })
})

describe('rows to fix', () => {
  it('the file\'s columns and a What to fix column, every row of a left-out product, formulas made inert', () => {
    const s = csvSheet('stress.csv')
    const m = matchColumns(s.headers, ctx)
    const r = readImport(m, s.rows, ctx)
    const p = planImport(r.products, { handles: new Set(), skus: new Set() })
    const csv = rowsToFix(s.headers, s.rows, p.leftOut, r.problems)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Item,Size,MRP,Qty,SKU,Purchase price,Supplier,Notes,What to fix',
      'Kota doria saree,,"Rs 1,2,99",4,KS-KTD,600,,typo in price,"MRP: ""Rs 1,2,99"" isn\'t a price"',
      "Ajrakh shirt,M,1599,4,KS-BPK-M,600,,'=SUM(A1:A9),SKU: KS-BPK-M is also on row 5",
      '',
    ])
  })
  it('escapes = + - @ tab and CR as gstr1-files does', () => {
    expect(['=1', '+1', '-1', '@a', '\tx', '\rx', 'ok', 'a,b'].map(csvCell)).toEqual(["'=1", "'+1", "'-1", "'@a", "'\tx", "\"'\rx\"", 'ok', '"a,b"'])
  })
})
