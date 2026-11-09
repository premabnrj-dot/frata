import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '@/domains/themes/catalogue'
import { resolveTheme } from '@/domains/themes/resolve'
import { samplePieces } from '../sample'
import { shellNeedsCatalogue, shellPictures } from '../page-look'

// The header's pictures and the footer's strip (Look v3): read only when a design needs them.
const now = new Date('2026-11-09T06:00:00Z')
const ed = CATALOGUE.editorial!['2.1.0']!
const cat = { products: samplePieces(), collections: [{ id: 'c', handle: 'kurtas', title: 'Kurtas', description: '', kind: 'manual' as const, matchAll: true, rules: [], sort: 'manual', productIds: [samplePieces()[0]!.id] }] }

describe('shell pictures', () => {
  it('no catalogue read for a header and footer that draw none', () => {
    expect(shellNeedsCatalogue(resolveTheme(ed, { style: 'haldi' }))).toBe(false)
    expect(shellPictures(resolveTheme(ed, { style: 'haldi' }), null, now)).toEqual({ circles: [], strip: [] })
  })
  it('the shop panel gets the collections; the Instagram strip the newest six with a photo', () => {
    const t = resolveTheme(ed, { style: 'haldi', settings: { header: 'panel', footer: 'gram' } })
    expect(shellNeedsCatalogue(t)).toBe(true)
    const p = shellPictures(t, cat, now)
    expect(p.circles.map((c) => c.handle)).toEqual(['kurtas'])
    expect(p.strip).toHaveLength(6)
    expect(p.strip.every((x) => x.image.base.length > 0)).toBe(true)
  })
})
