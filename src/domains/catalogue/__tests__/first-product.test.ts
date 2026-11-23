import { describe, expect, it } from 'vitest'
import { firstProductShape } from '../first-product'
import { PRESETS } from '../size-charts'

// The first-product popup and addFirstProduct read one rule for a new product's sizes (plan 2026-11-23-o2a-setup-card
// O2a·3), lifted from createProduct.
const rows = (k: keyof typeof PRESETS) => PRESETS[k].chart.rows.map((r) => r.size)
const typesOf = (...keys: (keyof typeof PRESETS)[]) => keys.map((k) => ({ id: k, name: PRESETS[k].name, chartSizes: rows(k) }))
const women = typesOf('womens_kurta', 'one_size')
const womenKids = typesOf('womens_kurta', 'kids', 'one_size')

describe('firstProductShape', () => {
  it('no name yet in a women’s store: sized, the kurta rows, three pressed', () => {
    expect(firstProductShape('', women, ['women'])).toEqual({ kind: 'sized', sized: true, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], pressed: ['S', 'M', 'L'], typeId: null })
  })
  it('the type’s own chart gives the options once the name finds it', () => {
    const edited = [{ id: 't1', name: 'Kurta set · Women', chartSizes: ['S', 'M', 'L', 'XL'] }]
    expect(firstProductShape('Ivory kurta set', edited, ['women'])).toEqual({ kind: 'sized', sized: true, options: ['S', 'M', 'L', 'XL'], pressed: ['S', 'M', 'L'], typeId: 't1' })
  })
  it('"Kids frock": the Kids type and its ages', () => {
    expect(firstProductShape('Kids frock', womenKids, ['women', 'kids'])).toEqual({ kind: 'kids', sized: true, options: rows('kids'), pressed: ['2–3 Y', '3–4 Y', '4–5 Y'], typeId: 'kids' })
  })
  it('"Silk saree": not sized, no options, the One size type', () => {
    expect(firstProductShape('Silk saree', women, ['women'])).toEqual({ kind: 'one_size', sized: false, options: [], pressed: [], typeId: 'one_size' })
  })
  it('any name in a beauty-only store: not sized', () => {
    for (const t of ['', 'Ivory kurta set', 'Kids frock', 'Kolhapuri chappal']) {
      const s = firstProductShape(t, typesOf('one_size'), ['beauty'])
      expect(s.sized, t).toBe(false)
      expect(s.options, t).toEqual([])
      expect(s.pressed, t).toEqual([])
    }
  })
  it('"Kolhapuri chappal": the footwear rows, with no Footwear type yet', () => {
    expect(firstProductShape('Kolhapuri chappal', women, ['women'])).toEqual({ kind: 'footwear', sized: true, options: rows('footwear'), pressed: ['UK 6', 'UK 7', 'UK 8'], typeId: null })
  })
  it('a kind chosen by the person wins over the name’s guess', () => {
    expect(firstProductShape('Silk saree', women, ['women'], 'sized').sized).toBe(true)
  })
})
