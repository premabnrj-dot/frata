import { describe, expect, it } from 'vitest'
import { goneOf, lineRows } from '../line-rows'

const L = (id: string) => ({ variantId: id })
const kinds = (rows: ReturnType<typeof lineRows>) => rows.map((r) => ('gone' in r ? `-${r.gone.variantId}` : r.line.variantId))

describe('lineRows (P2·4: Removed · Undo in the line’s place)', () => {
  it('puts a removed line back where it stood', () => {
    expect(kinds(lineRows([L('a'), L('c')], [{ variantId: 'b', qty: 1, title: 'B', at: 1 }]))).toEqual(['a', '-b', 'c'])
    expect(kinds(lineRows([L('b')], [{ variantId: 'a', qty: 1, title: 'A', at: 0 }]))).toEqual(['-a', 'b'])
  })
  it('keeps two removed lines in their order, and one past the end at the end', () => {
    const gone = [{ variantId: 'c', qty: 1, title: 'C', at: 2 }, { variantId: 'a', qty: 1, title: 'A', at: 0 }]
    expect(kinds(lineRows([L('b')], gone))).toEqual(['-a', 'b', '-c'])
    expect(kinds(lineRows([], [{ variantId: 'z', qty: 2, title: 'Z', at: 5 }]))).toEqual(['-z'])
  })
  it('never draws a line twice while the quote still has the removed one', () => {
    expect(kinds(lineRows([L('a'), L('b')], [{ variantId: 'b', qty: 1, title: 'B', at: 1 }]))).toEqual(['a', '-b'])
  })
  it('Undo puts back the quantity the shopper had, at least one', () => {
    expect(goneOf({ variantId: 'a', qty: 3, requested: 3, title: 'A' }, 0).qty).toBe(3)
    expect(goneOf({ variantId: 'a', qty: 0, requested: 2, title: 'A' }, 0).qty).toBe(2)
    expect(goneOf({ variantId: 'a', qty: 0, requested: 0, title: 'A' }, 0).qty).toBe(1)
  })
})
