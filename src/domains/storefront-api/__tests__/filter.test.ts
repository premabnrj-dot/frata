import { describe, expect, it } from 'vitest'
import { SENTINELS } from '../../../../scripts/cost-sentinels.mjs'
import * as S from '../2026-12/schemas'
import { searchOut, type CardIn, type CollectionIn } from '../2026-12/map'
import { facetValue, facetsOut, filterPageOut, parseFilter, type FilterQuery } from '../2026-12/filter'

const T = '11111111-1111-1111-1111-111111111111'
const M = { tenantId: T, mediaHost: 'abc123.public.blob.vercel-storage.com' }
const now = new Date('2026-11-15T06:00:00Z')
const costs = Object.fromEntries(SENTINELS.map((k) => [k, 987654321]))
const v = (id: string, size: string, over: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`, values: [size], price: 249000, compareAt: null, mrp: null, stock: 5, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, ...costs, ...over })
const card = (n: number, over: Partial<CardIn> = {}): CardIn => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, handle: `kurta-${n}`, title: `Kurta ${n}`, status: 'active', publishAt: null, since: `2026-11-${String(n).padStart(2, '0')}T00:00:00Z`,
  options: ['Size'], images: [], variants: [v(`${n}1`, 'M')], colours: [], categoryId: null, attributes: {}, tags: [], ...costs, ...over,
} as CardIn)
const q = (s: string) => { const r = parseFilter(new URLSearchParams(s)); if ('bad' in r) throw new Error(r.bad); return r as FilterQuery }
const all = [
  card(1, { variants: [v('11', 'S'), v('12', 'M', { stock: 0 })], colours: [{ value: 'Maroon', family: 'Red', hex: null }] }),
  card(2, { variants: [v('21', 'M', { price: 150000 })], colours: [{ value: 'Indigo', family: 'Blue', hex: null }] }),
  card(3, { variants: [v('31', 'Free size', { price: 650000 })], options: ['size'], colours: [{ value: 'Rust', family: 'Red', hex: null }] }),
  card(4, { status: 'draft', variants: [v('41', 'XXL')], colours: [{ value: 'Neon', family: 'Green', hex: null }] }),
  card(5, { publishAt: '2026-12-01T00:00:00Z', variants: [v('51', 'XS')] }),
]
const cat = { products: all, collections: [{ id: 'c1', handle: 'reds', title: 'Reds', description: '', kind: 'manual', matchAll: true, rules: [], sort: 'manual', productIds: [all[2]!.id, all[0]!.id] } as CollectionIn], movedCollections: { 'old-reds': 'reds' } }

describe('D2 filters (SA1b D·5; api-contract review M1–M4)', () => {
  it('the grammar: known parameters, each once, in order, no defaults spelled out', () => {
    expect(parseFilter(new URLSearchParams(''))).toEqual({ collection: null, size: null, colour: null, price: null, stock: false, sort: 'featured' })
    expect(q('collection=reds&size=m&colour=red&price=p2&stock=in&sort=price_asc')).toMatchObject({ collection: 'reds', size: 'm', colour: 'red', price: 'p2', stock: true, sort: 'price_asc' })
    for (const [s, bad] of [['evil=1', 'evil'], ['size=m&size=s', 'size'], ['colour=red&size=m', 'size'], ['sort=featured', 'sort'], ['sort=price-asc', 'sort'],
      ['stock=1', 'stock'], ['price=0-999', 'price'], ['size=M', 'size'], ['size=m,s', 'size'], ['collection=Bad_Handle', 'collection']] as const)
      expect(parseFilter(new URLSearchParams(s)), s).toEqual({ bad })
  })
  it('a well-formed value the store doesn’t have is an empty page, never an error', () => {
    for (const s of ['size=xxxl', 'colour=gold', 'collection=nope']) {
      const r = filterPageOut(M, cat, q(s), 1, now)!
      expect(r).toMatchObject({ products: [], total: 0, page: 1, pages: 1 })
      S.FilterPage.parse(r)
    }
  })
  it('each facet narrows the listed set; drafts and scheduled products never count', () => {
    const ids = (s: string) => filterPageOut(M, cat, q(s), 1, now)!.products.map((p) => p.handle)
    expect(ids('')).toEqual(['kurta-1', 'kurta-2', 'kurta-3'])
    expect(ids('size=m')).toEqual(['kurta-1', 'kurta-2'])
    expect(ids('size=free-size')).toEqual(['kurta-3'])
    expect(ids('colour=red')).toEqual(['kurta-1', 'kurta-3'])
    expect(ids('price=p2')).toEqual(['kurta-2'])
    expect(ids('price=p4')).toEqual(['kurta-3'])
    expect(ids('size=m&stock=in')).toEqual(['kurta-2'])
    expect(ids('sort=new')).toEqual(['kurta-3', 'kurta-2', 'kurta-1'])
    expect(ids('sort=price_desc')).toEqual(['kurta-3', 'kurta-1', 'kurta-2'])
    expect(ids('size=xxl')).toEqual([])
  })
  it('a collection keeps its own order, follows a moved handle, and filters inside it', () => {
    const ids = (s: string) => filterPageOut(M, cat, q(s), 1, now)!.products.map((p) => p.handle)
    expect(ids('collection=reds')).toEqual(['kurta-3', 'kurta-1'])
    expect(ids('collection=old-reds')).toEqual(['kurta-3', 'kurta-1'])
    expect(ids('collection=reds&size=s')).toEqual(['kurta-1'])
  })
  it('a page past the end is not found; every answer parses and carries no cost', () => {
    expect(filterPageOut(M, cat, q(''), 2, now)).toBeNull()
    const json = JSON.stringify(S.FilterPage.parse(filterPageOut(M, cat, q(''), 1, now)))
    expect(json).not.toContain('987654321')
  })
  it('a long size name still gives a value the grammar accepts, and the menu still parses (api-contract review on the diff, MAJOR 1)', () => {
    const long = `${'a'.repeat(39)} bcd`
    expect(facetValue(long)).toBe('a'.repeat(39))
    const f = facetsOut([card(9, { variants: [v('91', long)] })], now)
    S.Facets.parse(f)
    expect(parseFilter(new URLSearchParams(`size=${f.sizes[0]!.value}`))).not.toHaveProperty('bad')
  })
  it('facets: the exact value to send, counts over the listed set only', () => {
    const f = S.Facets.parse(facetsOut(all, now))
    expect(f.sizes).toEqual([{ value: 's', label: 'S', count: 1 }, { value: 'm', label: 'M', count: 2 }, { value: 'free-size', label: 'Free size', count: 1 }])
    expect(f.colours).toEqual([{ value: 'red', label: 'Red', count: 2 }, { value: 'blue', label: 'Blue', count: 1 }])
    expect(f.prices.map((b) => b.count)).toEqual([0, 1, 1, 1])
    expect(f.inStock).toBe(3)
    expect(JSON.stringify(f)).not.toMatch(/xxl|xs|green/i)
  })
  it('search answers as it did (the slim entry was not built: plan question 9)', () => {
    expect(searchOut(M, all, 'kurta', now).products.map((p) => p.handle)).toEqual(['kurta-1', 'kurta-2', 'kurta-3'])
  })
})
