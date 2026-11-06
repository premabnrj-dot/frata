import { describe, expect, it } from 'vitest'
import { cleanProduct, parseRupees, readiness, rupeesText, type ProductInput } from '../product-form'

const base: ProductInput = { title: 'Linen kurta set', description: '', typeId: null, modelHeight: '5 ft 6 in', modelSize: 'S',
  options: [{ name: 'Size', values: ['S', 'M'] }], variants: [
    { values: ['S'], price: '2,490', compareAt: '2990', cost: '980', stock: '6', sku: 'KS-LK-S' },
    { values: ['M'], price: '2490', compareAt: '', cost: '', stock: '', sku: '' }] }

describe('rupees', () => {
  it('reads what people type, refuses what is not a price', () => {
    expect(parseRupees('2,490')).toBe(249000); expect(parseRupees('₹2490.5')).toBe(249050)
    expect(parseRupees('Rs 999')).toBeNull(); expect(parseRupees('999.999')).toBeNull()
    expect(rupeesText(249050)).toBe('2490.50'); expect(rupeesText(249000)).toBe('2490')
  })
})

describe('cleanProduct', () => {
  it('turns the grid into paise, unknown cost stays null (not 0)', () => {
    const r = cleanProduct(base)
    const rest = { whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null }
    expect(r.ok && r.product.variants).toEqual([
      { values: ['S'], price: 249000, compareAt: 299000, unitCost: 98000, stock: 6, sku: 'KS-LK-S', ...rest },
      { values: ['M'], price: 249000, compareAt: null, unitCost: null, stock: 0, sku: null, ...rest }])
    expect(r.ok && r.product.handle).toBe('linen-kurta-set')
  })
  it('names the cell that is wrong', () => {
    const r = cleanProduct({ ...base, variants: [{ ...base.variants[0]!, compareAt: '2000' }, { ...base.variants[1]!, price: 'free', sku: 'ks-lk-s' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['v:M:price', 'v:M:sku', 'v:S:compareAt'])
  })
  it('a combination the grid never sent still needs a price', () => {
    const r = cleanProduct({ ...base, options: [{ name: 'Size', values: ['S', 'M', 'L'] }] })
    expect(!r.ok && r.errors['v:L:price']).toBe('A price in rupees.')
  })
})

describe('readiness', () => {
  it('lists what is missing', () => {
    const r = readiness({ title: 'X', photos: 0, prices: [249000, 0], hasSizes: true, chartRows: 0, anyBuyable: true })
    expect(r.filter((x) => !x.ok).map((x) => x.label)).toEqual(['At least one photo', 'A price on every size and colour', 'A size chart for its type'])
  })
})

describe('when it runs out', () => {
  const now = new Date('2026-11-06T12:00:00+05:30')
  it('pre-order needs a ship-by date within a year; made to order needs lead days', () => {
    const pre = (shipsBy: string) => cleanProduct({ ...base, variants: [{ ...base.variants[0]!, whenOut: 'preorder', shipsBy }, base.variants[1]!] }, now)
    expect(pre('2026-12-12').ok).toBe(true)
    expect(!pre('2026-11-05').ok && Object.keys((pre('2026-11-05') as { errors: object }).errors)).toEqual(['v:S:shipsBy'])
    expect(pre('2028-01-01').ok).toBe(false)
    const mto = cleanProduct({ ...base, variants: [{ ...base.variants[0]!, whenOut: 'made_to_order', leadMin: '10', leadMax: '14' }, base.variants[1]!] }, now)
    expect(mto.ok && mto.product.variants[0]).toMatchObject({ whenOut: 'made_to_order', leadMinDays: 10, leadMaxDays: 14 })
    expect(cleanProduct({ ...base, variants: [{ ...base.variants[0]!, whenOut: 'made_to_order', leadMin: '14', leadMax: '10' }, base.variants[1]!] }, now).ok).toBe(false)
  })
  it('handle shape and colours only for real colour values', () => {
    expect(cleanProduct({ ...base, handle: 'Bad Handle' }).ok).toBe(false)
    const c = cleanProduct({ ...base, options: [{ name: 'Colour', values: ['Indigo'] }], variants: [{ ...base.variants[0]!, values: ['Indigo'] }],
      colours: [{ value: 'Indigo', family: '2', hex: '#2E3A63', crop: null }, { value: 'Ghost', family: null, hex: null, crop: null }] })
    expect(c.ok && c.product.colours).toEqual([{ value: 'Indigo', family: '2', hex: '#2e3a63', crop: null }])
  })
})
