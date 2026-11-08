import { describe, expect, it } from 'vitest'
import type { ListProduct, ListVariant } from '../listing'
import { sourceProducts } from '../sources'

const now = new Date('2026-11-07T10:00:00+05:30')
const v = (over: Partial<ListVariant> = {}): ListVariant => ({ values: ['S'], price: 249000, compareAt: null, stock: 5, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, ...over })
const p = (id: string, since: string, over: Partial<ListProduct> = {}): ListProduct => ({ id, title: id, status: 'active', publishAt: null, since, categoryId: 'aa-1-23-7', attributes: {}, tags: [], colours: [], variants: [v()], ...over })

const cat = {
  products: [
    p('old', '2026-10-01T00:00:00Z'),
    p('new', '2026-11-05T00:00:00Z', { variants: [v({ price: 99000, compareAt: 149000 })] }),
    p('draft', '2026-11-06T00:00:00Z', { status: 'unlisted' }),
    p('later', '2026-11-09T00:00:00Z', { publishAt: '2026-11-09T00:00:00Z' }),
  ],
  collections: [{ handle: 'festive', kind: 'manual' as const, matchAll: true, rules: [], sort: 'manual', productIds: ['old', 'draft'] }],
}

describe('sources', () => {
  it('newest: listed only, newest first', () => expect(sourceProducts({ kind: 'newest' }, cat, now).map((x) => x.id)).toEqual(['new', 'old']))
  it('a collection: its listed members; an unknown handle is empty', () => {
    expect(sourceProducts({ kind: 'collection', handle: 'festive' }, cat, now).map((x) => x.id)).toEqual(['old'])
    expect(sourceProducts({ kind: 'collection', handle: 'gone' }, cat, now)).toEqual([])
  })
  it('under a price and on sale', () => {
    expect(sourceProducts({ kind: 'under_price', maxPaise: 100000 }, cat, now).map((x) => x.id)).toEqual(['new'])
    expect(sourceProducts({ kind: 'on_sale' }, cat, now).map((x) => x.id)).toEqual(['new'])
  })
  it('a scheduled product appears at its moment', () => expect(sourceProducts({ kind: 'newest' }, cat, new Date('2026-11-10T00:00:00Z')).map((x) => x.id)[0]).toBe('later'))
})
