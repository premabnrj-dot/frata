import { describe, expect, it } from 'vitest'
import { cleanOptions, combinations, groupOption, handleFor, reconcile, skuFor, uniqueSku } from '../variants'

describe('cleanOptions', () => {
  it('tidies names and values and drops empty values', () => {
    expect(cleanOptions([{ name: ' Size ', values: ['S', ' M ', ''] }])).toEqual({ ok: true, options: [{ name: 'Size', values: ['S', 'M'] }] })
  })
  it('refuses duplicates, empties, too many options and too many variants', () => {
    expect(cleanOptions([{ name: 'Size', values: ['M', 'm'] }]).ok).toBe(false)
    expect(cleanOptions([{ name: 'Size', values: [] }]).ok).toBe(false)
    expect(cleanOptions([{ name: 'Size', values: ['S'] }, { name: 'size', values: ['M'] }]).ok).toBe(false)
    expect(cleanOptions(['A', 'B', 'C', 'D'].map((name) => ({ name, values: ['x'] }))).ok).toBe(false)
    const big = cleanOptions([{ name: 'Size', values: Array.from({ length: 11 }, (_, i) => `S${i}`) }, { name: 'Colour', values: Array.from({ length: 10 }, (_, i) => `C${i}`) }])
    expect(big.ok || big.error).toMatch(/110 sizes and colours/)
  })
  it('6 sizes × 8 colours = 48 variants is fine', () => {
    expect(cleanOptions([{ name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] }, { name: 'Colour', values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }]).ok).toBe(true)
  })
})

describe('combinations', () => {
  it('every combination, first option slowest', () => {
    expect(combinations([{ name: 'Size', values: ['S', 'M'] }, { name: 'Colour', values: ['Indigo', 'Rust'] }]))
      .toEqual([['S', 'Indigo'], ['S', 'Rust'], ['M', 'Indigo'], ['M', 'Rust']])
  })
  it('no options is one variant with no values', () => expect(combinations([])).toEqual([[]]))
})

describe('reconcile', () => {
  it('keeps variants by their values, adds the new, removes the gone', () => {
    const existing = [{ id: 'a', optionValues: ['S'] }, { id: 'b', optionValues: ['L'] }]
    const r = reconcile(existing, [{ name: 'Size', values: ['S', 'M'] }])
    expect(r.keep.map((v) => v.id)).toEqual(['a'])
    expect(r.add).toEqual([['M']])
    expect(r.remove.map((v) => v.id)).toEqual(['b'])
  })
})

describe('groupOption and handleFor', () => {
  it('groups by colour when there is one', () => {
    expect(groupOption([{ name: 'Colour', values: [] }, { name: 'Size', values: [] }])).toBe(0)
    expect(groupOption([{ name: 'Size', values: [] }, { name: 'Fabric', values: [] }])).toBe(1)
    expect(groupOption([{ name: 'Size', values: [] }])).toBe(-1)
  })
  it('makes a shop address for a product', () => expect(handleFor('Linen Kurta Set — Indigo & Rust')).toBe('linen-kurta-set-indigo-and-rust'))
})

describe('default SKUs', () => {
  it('prefix, product code, values', () => {
    expect(skuFor('KS', 'linen-kurta-set', ['M', 'Indigo'])).toBe('KS-LINKUR-M-IND')
    expect(skuFor('ks', 'dupatta', [])).toBe('KS-DUPATT')
    expect(skuFor('', 'saree', ['Free size'])).toBe('SKU-SAREE-FRE')
  })
  it('never repeats one already taken', () => {
    expect(uniqueSku('KS-LINKUR-M', new Set(['KS-LINKUR-M', 'KS-LINKUR-M-2']))).toBe('KS-LINKUR-M-3')
    expect(uniqueSku('KS-A', new Set())).toBe('KS-A')
  })
})
