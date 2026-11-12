import { describe, expect, it } from 'vitest'
import { isKind, kindOf, startSizes, typeFor } from '../kind'

const types = [
  { id: 'k', name: 'Kurta set · Women' }, { id: 's', name: 'Shirt · Men' }, { id: 'kids', name: 'Kids' },
  { id: 'f', name: 'Footwear' }, { id: 'o', name: 'One size' },
]

describe('a new product takes its kind and type from its name (PR·0: the first type went to everything)', () => {
  it('reads the kind, kids before one size before footwear', () => {
    expect(kindOf('Linen kurta set')).toBe('sized')
    expect(kindOf("Girls' cotton kurta")).toBe('kids')
    expect(kindOf('Kids jutti')).toBe('kids')
    expect(kindOf('Banarasi silk saree')).toBe('one_size')
    expect(kindOf('Oxidised jhumka earrings')).toBe('one_size')
    expect(kindOf('Handmade leather mojari')).toBe('footwear')
    expect(kindOf('कुर्ता सेट')).toBe('sized')
    expect(kindOf('Cream linen kurta')).toBe('sized')
    expect(kindOf('Cap sleeve top')).toBe('sized')
    expect(startSizes.sized).toEqual(['S', 'M', 'L'])
    expect(startSizes.footwear).toEqual(['UK 6', 'UK 7', 'UK 8'])
    expect(startSizes.kids[0]).toBe('2–3 Y')
  })
  it('picks the type that shares a telling word, the kind’s own, or none', () => {
    expect(typeFor('Linen kurta set', types)).toBe('k')
    expect(typeFor("Men's oxford shirts", types)).toBe('s')
    expect(typeFor("Girls' cotton kurta", types)).toBe('kids')
    expect(typeFor('Kolhapuri chappal', types)).toBe('f')
    expect(typeFor('Banarasi silk saree', types)).toBe('o')
    expect(typeFor('Wrap dress', types)).toBeNull()
    expect(typeFor("Women's co-ord set", types)).toBeNull()
    expect(typeFor('Kids frock', [{ id: 'k', name: 'Kurta set · Women' }])).toBeNull()
  })
  it('a chosen kind wins over the name: "Linen kurta" chosen as Kids takes the Kids type, never the women\'s chart', () => {
    expect(typeFor('Linen kurta', types, undefined, 'kids')).toBe('kids')
    expect(typeFor('Linen kurta', types, undefined, 'one_size')).toBe('o')
    expect(typeFor('Kids frock', types, undefined, 'sized')).toBeNull()
  })
  it('the server takes only a known kind', () => {
    expect(['sized', 'footwear', 'kids', 'one_size'].every(isKind)).toBe(true)
    expect([undefined, '', 'Kids', 'shoes', 1, null].some(isKind)).toBe(false)
  })
  it('an import with sizes falls back to the first type whose chart has them all', () => {
    const charts = [{ id: 'kids', name: 'Kids', chartSizes: ['2–3 Y'] }, { id: 'k', name: 'Kurta set · Women', chartSizes: ['XS', 'S', 'M', 'L', 'XL'] }]
    expect(typeFor('Wrap dress', charts, ['S', 'M', 'XL'])).toBe('k')
    expect(typeFor('Wrap dress', charts, ['S', '3XL'])).toBeNull()
    expect(typeFor('Wrap dress', charts)).toBeNull()
  })
})
