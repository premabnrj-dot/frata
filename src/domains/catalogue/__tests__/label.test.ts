import { describe, expect, it } from 'vitest'
import { cleanLabel, EMPTY_LABEL, labelAsked, labelInput, labelMissing, labelRows, readLabel } from '../label'

describe('label', () => {
  it('is asked of beauty and wellness shops only', () => {
    expect(labelAsked(['beauty'])).toBe(true)
    expect(labelAsked(['women', 'wellness'])).toBe(true)
    expect(labelAsked(['women', 'jewellery'])).toBe(false)
    expect(labelAsked([])).toBe(false)
  })
  it('checks what the editor sends', () => {
    const ok = cleanLabel({ net: '1,5', unit: 'l', maker: '  Kesar  Naturals,  Indore ', shelf: '24', ingredients: ' Aqua ', use: '' })
    expect(ok).toEqual({ ok: true, label: { net: '1.5', unit: 'l', maker: 'Kesar Naturals, Indore', shelfMonths: 24, ingredients: 'Aqua', use: '' } })
    const bad = cleanLabel({ net: 'fifty', unit: 'oz', maker: 'x'.repeat(301), shelf: '0', ingredients: '', use: '' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['maker', 'net', 'shelf', 'unit'])
    expect(cleanLabel({ net: '0', unit: 'g', maker: '', shelf: '', ingredients: '', use: '' }).ok).toBe(false)
  })
  it('reads a stored label leniently and round-trips through the editor', () => {
    expect(readLabel(null)).toEqual(EMPTY_LABEL)
    expect(readLabel({ net: 5, unit: 'gallon', shelfMonths: 1.5 })).toEqual(EMPTY_LABEL)
    const l = { net: '50', unit: 'ml' as const, maker: 'Kesar', shelfMonths: 12, ingredients: '', use: '' }
    const back = cleanLabel(labelInput(l))
    expect(back.ok && back.label).toEqual(l)
  })
  it('names what is missing before going live, and shows only what is filled', () => {
    expect(labelMissing(EMPTY_LABEL)).toEqual(['net quantity', 'who made or packed it', 'best before'])
    const l = { ...EMPTY_LABEL, net: '50', unit: 'g' as const, maker: 'Kesar, Indore', shelfMonths: 18 }
    expect(labelMissing(l)).toEqual([])
    expect(labelRows(l, 'India')).toEqual([
      { name: 'Net quantity', value: '50 g' }, { name: 'Best before', value: '18 months from manufacture' },
      { name: 'Made or packed by', value: 'Kesar, Indore' }, { name: 'Country of origin', value: 'India' },
    ])
    expect(labelRows(EMPTY_LABEL, null)).toEqual([])
  })
})
