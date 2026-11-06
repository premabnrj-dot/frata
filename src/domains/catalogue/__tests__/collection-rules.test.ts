import { describe, expect, it } from 'vitest'
import { cleanRules, matches, type ProductFacts } from '../collection-rules'

const kurta: ProductFacts = { categoryId: 'aa-1-23-7', attributes: { fabric: ['frata:chanderi'] }, colourFamilies: ['2'], minPrice: 189000, inStock: true, tags: ['Festive'] }

describe('collection rules', () => {
  it('category includes everything under it', () => {
    expect(matches([{ field: 'category', value: 'aa-1-23' }], true, kurta)).toBe(true)
    expect(matches([{ field: 'category', value: 'aa-1-23-2' }], true, kurta)).toBe(false)
  })
  it('all vs any', () => {
    const rules = [{ field: 'attribute', handle: 'fabric', value: 'frata:chanderi' }, { field: 'price_below', value: 150000 }] as const
    expect(matches([...rules], true, kurta)).toBe(false)
    expect(matches([...rules], false, kurta)).toBe(true)
  })
  it('no rules matches nothing; out of stock leaves "in stock" collections', () => {
    expect(matches([], true, kurta)).toBe(false)
    expect(matches([{ field: 'in_stock' }], true, { ...kurta, inStock: false })).toBe(false)
    expect(matches([{ field: 'tag', value: 'festive' }], true, kurta)).toBe(true)
  })
  it('cleans what the console sends', () => {
    expect(cleanRules([{ field: 'price_below', value: 1999.5 }, { field: 'evil' }, { field: 'in_stock', extra: 1 }, { field: 'tag', value: ' sale ' }])).toEqual([{ field: 'in_stock' }, { field: 'tag', value: 'sale' }])
  })
})
