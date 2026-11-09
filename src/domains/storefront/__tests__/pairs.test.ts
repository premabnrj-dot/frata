import { describe, expect, it } from 'vitest'
import { pairRowsOf, type PairPiece } from '../pairs'

const NOW = new Date('2026-11-09T10:00:00Z')
const v = (id: string, price: number, stock: number, values: string[] = []) => ({ id, values, price, compareAt: null, stock, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false })
const piece = (o: Partial<PairPiece> & { id: string }): PairPiece => ({ handle: o.id, title: o.id, status: 'active', publishAt: null, options: [], variants: [v(`${o.id}-v`, 49000, 3)], ...o })

describe('pairRowsOf', () => {
  it('Add for one size, Choose for sizes, priced at what can be bought now', () => {
    const rows = pairRowsOf([piece({ id: 'tag' }), piece({ id: 'pack', options: ['Size'], variants: [v('s', 299000, 0, ['S']), v('m', 319000, 2, ['M'])] })], NOW)
    expect(rows.map((r) => [r.piece.id, r.act, r.price])).toEqual([['tag', 'add', 49000], ['pack', 'choose', 319000]])
    expect(rows[0]!.variantId).toBe('tag-v')
  })
  it('hides archived, scheduled, sold-out and unpriced pieces; shows an unlisted one', () => {
    const later = new Date(NOW.getTime() + 86_400_000).toISOString()
    const rows = pairRowsOf([
      piece({ id: 'gone', status: 'archived' }), piece({ id: 'soon', publishAt: later }),
      piece({ id: 'out', variants: [v('o', 49000, 0)] }), piece({ id: 'free', variants: [v('f', 0, 5)] }), piece({ id: 'quiet', status: 'unlisted' }),
    ], NOW)
    expect(rows.map((r) => r.piece.id)).toEqual(['quiet'])
  })
})
