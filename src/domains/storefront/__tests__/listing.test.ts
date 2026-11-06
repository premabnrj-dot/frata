import { describe, expect, it } from 'vitest'
import { cardTag, inCollection, isListed, priceOf, sortProducts, type ListProduct, type ListVariant } from '../listing'
import { initialPick, optionState, pickQuery, variantFor } from '../picker'

const now = new Date('2026-11-07T10:00:00+05:30')
const v = (values: string[], over: Partial<ListVariant> = {}): ListVariant => ({ values, price: 249000, compareAt: null, stock: 5, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, ...over })
const p = (id: string, over: Partial<ListProduct> = {}): ListProduct => ({ id, title: id, status: 'active', publishAt: null, since: '2026-11-01T00:00:00.000Z', categoryId: 'aa-1-23-7', attributes: {}, tags: [], colours: [], variants: [v(['S'])], ...over })

describe('lists', () => {
  it('lists active products only, and scheduled ones from their moment', () => {
    expect(isListed(p('a'), now)).toBe(true)
    expect(isListed(p('a', { status: 'unlisted' }), now)).toBe(false)
    expect(isListed(p('a', { publishAt: '2026-11-08T00:00:00.000Z' }), now)).toBe(false)
    expect(isListed(p('a', { publishAt: '2026-11-08T00:00:00.000Z' }), new Date('2026-11-09T00:00:00Z'))).toBe(true)
  })
  it('prices from the lowest, compare-at only when it holds for that price', () => {
    expect(priceOf(p('a', { variants: [v(['S'], { price: 199000, compareAt: 249000 }), v(['M'], { price: 219000 })] }))).toEqual({ min: 199000, max: 219000, compareAt: 249000 })
    expect(priceOf(p('a', { variants: [v(['S'], { price: 0 })] }))).toBeNull()
  })
  it('tags a card only when nothing is in stock', () => {
    expect(cardTag(p('a'), now)).toBeNull()
    expect(cardTag(p('a', { variants: [v(['S'], { stock: 0 })] }), now)).toBe('Sold out')
    expect(cardTag(p('a', { variants: [v(['S'], { stock: 0, whenOut: 'preorder', shipsBy: '2026-12-12' })] }), now)).toBe('Pre-order')
    expect(cardTag(p('a', { variants: [v(['S'], { stock: 0, whenOut: 'preorder', shipsBy: '2026-12-12', preorderFull: true })] }), now)).toBe('Sold out')
  })
  it('fills a rule collection at render, and keeps a hand-picked order', () => {
    const all = [p('k1', { since: '2026-11-02T00:00:00Z' }), p('s1', { categoryId: 'aa-1-23-2-1' }), p('k2', { status: 'unlisted' })]
    expect(inCollection({ kind: 'auto', matchAll: true, rules: [{ field: 'category', value: 'aa-1-23-7' }], sort: 'newest', productIds: [] }, all, now).map((x) => x.id)).toEqual(['k1'])
    expect(inCollection({ kind: 'manual', matchAll: true, rules: [], sort: 'manual', productIds: ['s1', 'k1', 'k2'] }, all, now).map((x) => x.id)).toEqual(['s1', 'k1'])
    expect(sortProducts(all, 'title').map((x) => x.id)).toEqual(['k1', 'k2', 's1'])
  })
})

describe('picker', () => {
  const opts = ['Colour', 'Size'], vals = [['Indigo', 'Rust'], ['S', 'M']]
  const vs = [v(['Indigo', 'S'], { stock: 0 }), v(['Indigo', 'M'], { stock: 0 }), v(['Rust', 'S']), v(['Rust', 'M'], { stock: 0 })]
  it('opens the linked choice, else the first colour that can be bought, size unpicked', () => {
    expect(initialPick(opts, vals, vs, { colour: 'indigo', size: 'm' }, now)).toEqual(['Indigo', 'M'])
    expect(initialPick(opts, vals, vs, {}, now)).toEqual(['Rust', null])
    expect(initialPick(['Size'], [['Free size']], [v(['Free size'])], {}, now)).toEqual(['Free size'])
  })
  it('says which sizes can be bought in the chosen colour', () => {
    expect(optionState(vs, ['Rust', null], 1, 'S', now).canBuy).toBe(true)
    expect(optionState(vs, ['Rust', null], 1, 'M', now).availability?.kind).toBe('sold_out')
    expect(optionState(vs, [null, 'S'], 0, 'Indigo', now).canBuy).toBe(false)
  })
  it('names the variant and its link', () => {
    expect(variantFor(vs, ['Rust', 'S'])).toBe(vs[2])
    expect(variantFor(vs, ['Rust', null])).toBeNull()
    expect(pickQuery(opts, ['Rani Pink', 'M'])).toBe('?colour=rani-pink&size=m')
  })
})
