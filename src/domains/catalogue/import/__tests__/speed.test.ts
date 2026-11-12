// A hostile chunk (security review of PI·1, 2026-11-12: one 480 kB chunk once cost ~18 s of CPU): cells at their caps
// built to make a backtracking pattern work hardest, and cells past them, are read in well under a second; a cell past
// its cap is a problem on its row and no rule reads it.
import { describe, expect, it } from 'vitest'
import { htmlText, parseStock, splitValues } from '../cells'
import type { Mapping } from '../fields'
import { CHUNK_BYTES, rowBytes } from '../limits'
import { CELL_CAPS, readImport } from '../read'

const ctx = { now: new Date('2026-11-12T06:00:00Z'), hsnDigits: 4, costs: true }
const m: Mapping = { source: 'sheet', headers: ['Name', 'Sizes', 'Colours', 'Price', 'MRP', 'Stock', 'SKU', 'Description', 'Tags'],
  fields: ['title', 'size', 'colour', 'price', 'compareAt', 'stock', 'sku', 'description', 'tags'] }

describe('a hostile chunk', () => {
  it('cells at their caps, built for backtracking, read in well under a second', () => {
    const spaces = (n: number) => ' '.repeat(n)
    const row = (i: number) => ({ n: i + 2, cells: [
      `Kurta ${i}${spaces(150)}`, `S${spaces(240)}/${spaces(240)}x`, `${'a '.repeat(249)}`, `₹${spaces(97)}1,`, `Rs${spaces(96)}/-`,
      `S${spaces(480)}:1${spaces(10)}x`, `K${'-'.repeat(98)}`, `${'<a'.repeat(2400)}${'&aaaaaaaa'.repeat(50)}`, `${', '.repeat(499)}`,
    ] })
    const rows = []
    for (let i = 0, size = 0; size < CHUNK_BYTES - 40_000; i++) { const r = row(i); rows.push(r); size += rowBytes(m, r) }
    const at = performance.now()
    const read = readImport(m, rows, ctx)
    const took = performance.now() - at
    expect(read.products.length).toBe(rows.length)
    expect(took).toBeLessThan(1000)
  })
  it('a cell past its cap is a problem on its row, and no rule reads it', () => {
    const r = { n: 2, cells: ['Kurta', 'S'.repeat(501), '', '999', '', '1', 'K-1', '', ''] }
    expect(readImport(m, [r], ctx).problems).toEqual([{ row: 2, column: 'Sizes', message: `Up to ${CELL_CAPS.size} characters` }])
  })
  it('the cell readers are linear on what used to backtrack', () => {
    const at = performance.now()
    for (let i = 0; i < 20; i++) {
      splitValues(`S${' '.repeat(20_000)}x`, 'size'); parseStock(`S${' '.repeat(20_000)}:1x`); htmlText('<a'.repeat(10_000) + '&' + 'a'.repeat(10_000))
    }
    expect(performance.now() - at).toBeLessThan(500)
  })
  it('entities: an unknown name stays, a code point past Unicode is a space, and prototype names are not entities', () => {
    expect(htmlText('<p>a &constructor; b &#9999999; c &amp; d &#2325;</p>')).toBe('a &constructor; b c & d क')
  })
})
