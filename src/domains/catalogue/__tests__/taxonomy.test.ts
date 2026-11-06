import { describe, expect, it } from 'vitest'
import { attributesFor, categoryById, cleanAttributes, COLOUR_FAMILIES, isWithin, searchCategories, TAXONOMY_TAG } from '../taxonomy'

describe('taxonomy', () => {
  it('is the pinned release, with Indian ethnic wear', () => {
    expect(TAXONOMY_TAG).toBe('v2026-10')
    expect(categoryById('aa-1-23-7')?.name).toBe('Kurtas & Kurta Sets')
    expect(categoryById('aa-1-23-2-1')?.googleId).toBe(8248)
  })
  it('finds categories by the words people use', () => {
    expect(searchCategories('saree')[0]?.name).toBe('Saris')
    expect(searchCategories('kurti')[0]?.name).toBe('Kurtas & Kurta Sets')
    expect(searchCategories('lehenga')[0]?.name).toBe('Lehengas')
    expect(searchCategories('').length).toBeGreaterThan(0)
  })
  it('a category brings its details; colour and size come from the variants', () => {
    const a = attributesFor('aa-1-23-7').map((x) => x.handle)
    expect(a).toContain('fabric'); expect(a).toContain('frata-occasion'); expect(a).toContain('frata-set-includes'); expect(a).toContain('embellishment-technique')
    expect(a).not.toContain('color'); expect(a).not.toContain('size')
    const fabric = attributesFor('aa-1-23-7').find((x) => x.handle === 'fabric')!
    const chanderi = fabric.values.find((v) => v.name === 'Chanderi')!
    expect(chanderi.frata).toBe(true); expect(fabric.values.find((v) => v.id === chanderi.mapsTo)?.name).toBe('Silk')
  })
  it('keeps only details and values the category allows', () => {
    const fabricSilk = attributesFor('aa-1-23-7').find((x) => x.handle === 'fabric')!.values.find((v) => v.name === 'Silk')!.id
    expect(cleanAttributes('aa-1-23-7', { fabric: [fabricSilk, 'nonsense'], 'wheel-size': ['x'] })).toEqual({ fabric: [fabricSilk] })
  })
  it('colour families and nesting', () => {
    expect(COLOUR_FAMILIES.map((c) => c.name)).toContain('Blue')
    expect(isWithin('aa-1-23-7', 'aa-1-23')).toBe(true); expect(isWithin('aa-1-230', 'aa-1-23')).toBe(false)
  })
})

describe('describeAttribute', () => {
  it('names standard, Frata-added and Frata-own values', async () => {
    const { describeAttribute } = await import('../taxonomy')
    expect(describeAttribute('fabric')?.values.some((v) => v.id === 'frata:chanderi')).toBe(true)
    expect(describeAttribute('frata-occasion')?.name).toBe('Occasion')
    expect(describeAttribute('nope')).toBeNull()
  })
})
