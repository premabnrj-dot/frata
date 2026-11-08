import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { brandColourProblem, carryOver, diffLayers, layerProblems, onColour } from '../layer'
import { readinessOf, truePromises, type ShopFacts } from '../readiness'
import { resolveTheme } from '../resolve'
import { SectionSchema, type SectionInstance } from '../sections'

const ed = CATALOGUE.editorial!['1.0.0']!, mi = CATALOGUE.minimal!['1.0.0']!, cl = CATALOGUE.classic!['1.0.0']!
const sec = (x: unknown) => SectionSchema.parse(x)

describe('brand colour', () => {
  it('refused when too light on a scheme, accepted when readable; text on it is white or ink', () => {
    const schemes = Object.values(resolveTheme(ed, { style: 'haldi' }).schemes)
    expect(brandColourProblem('#F2C14E', schemes)).toMatch(/Too light/)
    expect(brandColourProblem('#7A1F2B', [schemes[0]!])).toBeNull()
    expect(onColour('#7A1F2B')).toBe('#FFFFFF'); expect(onColour('#F2E6C8')).toBe('#1F1A17')
  })
  it('an unreadable brand colour in a stored layer is ignored at render', () => {
    expect(resolveTheme(ed, { style: 'haldi', settings: { brandColour: '#F2C14E' } }).settings.brandColour).toBeNull()
    expect(resolveTheme(ed, { style: 'haldi', settings: { brandColour: '#7A1F2B' } }).schemes.paper.accent).toBe('#7A1F2B')
  })
})

describe('layerProblems (save tier)', () => {
  it('shape and limits only', () => {
    expect(layerProblems({ settings: {}, home: [] })).toEqual([])
    expect(layerProblems({ settings: { corners: 'blobby' } })[0]).toMatch(/corners/)
    const two = [{ id: 'a', key: 'promises', show: ['cod'] }, { id: 'b', key: 'promises', show: ['cod'] }]
    expect(layerProblems({ home: two })[0]).toMatch(/Shop by promise: at most 1/)
    expect(layerProblems({ home: [{ id: 'x', key: 'hero', heading: { text: 'x'.repeat(61) } }] })[0]).toMatch(/Section 1/)
    expect(layerProblems({ settings: { announcement: { text: 'Hi', link: 'https://evil.example', scheme: 'paper' } } })[0]).toMatch(/announcement/)
  })
})

describe('carryOver (Try another theme)', () => {
  it('keeps what the new theme allows, says what it drops, keeps an edited Home', () => {
    const home = [sec({ id: 'p', key: 'promises', show: ['cod'] }), sec({ id: 'n', key: 'products', heading: 'New', source: { kind: 'newest' }, count: 4 })]
    const r = carryOver({ manifest: ed, layer: { style: 'rose', settings: { header: 'centred', corners: 'round', pairing: 'playfair' }, home } }, mi)
    expect(r.layer.style).toBe('ink'); expect(r.layer.settings?.corners).toBe('round'); expect(r.layer.settings?.pairing).toBeUndefined()
    expect(r.lost.join()).toMatch(/playfair/)
    expect(r.layer.home?.length).toBe(2)
    expect(carryOver({ manifest: cl, layer: { style: 'oxide' } }, ed).layer.home).toBeUndefined()
  })
})

describe('diffLayers (the publish list)', () => {
  const h = (xs: unknown[]) => xs.map(sec) as SectionInstance[]
  it('names what shoppers will see change', () => {
    const a = { theme: 'editorial', style: 'haldi', settings: {}, home: h([{ id: 'n', key: 'products', heading: 'New', source: { kind: 'newest' }, count: 4 }, { id: 'o', key: 'promises', show: ['cod'] }]) }
    const b = { theme: 'editorial', themeName: 'Editorial', style: 'rose', styleName: 'Rose', settings: { corners: 'round' as const }, home: h([{ id: 'o', key: 'promises', show: ['cod'], hidden: true }, { id: 'n', key: 'products', heading: 'New', source: { kind: 'newest' }, count: 4 }, { id: 'b', key: 'products', heading: 'Best', source: { kind: 'best_sellers' }, count: 4 }]) }
    expect(diffLayers(a, b)).toEqual(['Colours: Rose', 'Corners', 'Shop by promise hidden', 'Products added', 'Sections moved'])
    expect(diffLayers(null, b)).toEqual(['Theme: Editorial · Rose'])
  })
})

describe('readiness (publish tier)', () => {
  const f: ShopFacts = { collections: [{ handle: 'kurtas', hasProducts: true }, { handle: 'empty', hasProducts: false }], codOn: true, freeShippingAbove: null, returnDays: 7, dispatchDays: 2 }
  const now = new Date('2026-11-08T10:00:00Z')
  it('blocks a photo section without a photo or alt; warns on facts that hide a section', () => {
    const home = [
      sec({ id: 'h', key: 'hero', layout: 'image_text', heading: { text: 'Hi' } }),
      sec({ id: 'i', key: 'image_text', heading: 'x', image: { base: 'https://x/y', widths: [400], width: 800, height: 1000, alt: '' } }),
      sec({ id: 't', key: 'collection_tiles', mode: 'picked', handles: ['kurtas', 'empty', 'gone'] }),
      sec({ id: 'd', key: 'drop_teaser', heading: 'Soon', at: '2026-11-01T00:00:00+05:30' }),
      sec({ id: 'p', key: 'promises', show: ['free_shipping'] }),
    ]
    const r = readinessOf(home, f, now)
    expect(r.filter((x) => x.blocks).map((x) => x.sectionId)).toEqual(['h', 'i', 't'])
    expect(r.filter((x) => !x.blocks).map((x) => x.sectionId)).toEqual(['t', 'd', 'p'])
    expect(truePromises(f)).toEqual(['cod', 'returns', 'dispatch'])
  })
  it('Shop the look needs a photo, its words, and at least one piece', () => {
    const img = { base: 'https://x/y', widths: [400], width: 800, height: 1000, alt: 'A look' }
    const r = (o: object) => readinessOf([sec({ id: 'l', key: 'shop_the_look', ...o })], f, now).filter((x) => x.blocks).map((x) => x.text)
    expect(r({})).toEqual(['Shop the look: add a photo', 'Shop the look: pin at least one piece on the photo'])
    expect(r({ image: { ...img, alt: '' }, pieces: [{ handle: 'a', x: 1, y: 1 }] })).toEqual(['Shop the look: describe the photo for people who can’t see it'])
    expect(r({ image: img, pieces: [{ handle: 'a', x: 1, y: 1 }] })).toEqual([])
  })
})
