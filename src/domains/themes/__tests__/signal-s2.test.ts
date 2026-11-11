import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { codeSource, manifestOf as manifestIn } from '../source'
const manifestOf = (k: string, v: string) => manifestIn(codeSource, k, v)
import { readinessOf } from '../readiness'
import { resolveTheme, settingAttrs } from '../resolve'
import { SectionSchema } from '../sections'

// Signal S2 (docs/plans/2026-11-09-signal-s2.md): the Spotlight layout, the Hero's script line and the heading scale
// only where a theme offers them; the story sections never stop a first publish.
const home = [
  { id: 'h', key: 'hero', layout: 'image_text', script: 'Monsoon Edit', heading: { text: 'Roam' } },
  { id: 's', key: 'image_text', layout: 'spotlight', heading: 'Built for the 8:10 local.' },
]

describe('offered only where a theme lists them', () => {
  it('no released theme today offers the Spotlight layout, the script line or the scale', () => {
    for (const vs of Object.values(CATALOGUE)) for (const m of Object.values(vs)) {
      if (m.allowed.imageTextLayouts?.length || m.allowed.heroScript || m.scale) continue
      const r = resolveTheme(m, { style: m.styles[0]!.key, home })
      expect(r.home.find((s) => s.key === 'hero')).not.toHaveProperty('script')
      expect(r.home.find((s) => s.key === 'image_text')).not.toHaveProperty('layout')
      expect(settingAttrs(r)).not.toHaveProperty('data-scale')
    }
  })
  it('Signal 1.1 drops them (released before S2)', () => {
    const r = resolveTheme(manifestOf('signal', '1.1.0')!, { style: 'cobalt', home })
    expect(r.home.find((s) => s.key === 'hero')).not.toHaveProperty('script')
    expect(r.home.find((s) => s.key === 'image_text')).not.toHaveProperty('layout')
  })
})

describe('the story sections never stop a first publish', () => {
  const f = { collections: [], codOn: true, freeShippingAbove: null, returnDays: 7, dispatchDays: 2 }
  const now = new Date('2026-11-09T10:00:00Z')
  const issues = (s: object) => readinessOf([SectionSchema.parse(s)], f, now).map((x) => ({ blocks: x.blocks, text: x.text }))
  const img = (o: object = {}) => ({ base: 'https://x/p', widths: [400], width: 4, height: 5, alt: 'A tote on the 8:10', decorative: false, focus: null, ...o })
  it('an empty fan or statement shows nothing, without blocking', () => {
    expect(issues({ id: 'f', key: 'story_fan' })).toEqual([{ blocks: false, text: 'Story fan: add 3 cards with photos, or it shows nothing' }])
    expect(issues({ id: 'st', key: 'statement', wordmark: '' })).toEqual([{ blocks: false, text: 'Statement: add a photo and a wordmark, or it shows nothing' }])
  })
  it('three cards with described photos are ready; a photo with no description blocks; a nameless link blocks', () => {
    const card = { image: img(), title: 'The commute' }
    expect(issues({ id: 'f', key: 'story_fan', cards: [card, card, card] })).toEqual([])
    expect(issues({ id: 'f', key: 'story_fan', cards: [card, card, { image: img({ alt: '' }) }] }).filter((i) => i.blocks)).toHaveLength(1)
    expect(issues({ id: 'f', key: 'story_fan', cards: [card, card, { image: img({ decorative: true, alt: '' }), link: '/products' }] }).filter((i) => i.blocks).map((i) => i.text)).toEqual(['Story fan: give each linked card a title'])
  })
  it('a statement with a described photo and a wordmark is ready', () => {
    expect(issues({ id: 'st', key: 'statement', wordmark: 'the long way', image: img() })).toEqual([])
  })
})

describe('trying another theme says what doesn\'t come across', () => {
  it('the Spotlight and the handwritten line', async () => {
    const { carryOver } = await import('../layer')
    const r = carryOver({ manifest: manifestOf('signal', '1.2.0')!, layer: { style: 'cobalt', home } }, manifestOf('editorial', '2.1.0')!)
    expect(r.lost).toEqual(expect.arrayContaining(["Spotlight shows as Image with text in Editorial", "The Hero's handwritten line isn't in Editorial"]))
    const same = carryOver({ manifest: manifestOf('signal', '1.2.0')!, layer: { style: 'cobalt', home } }, manifestOf('signal', '1.2.0')!)
    expect(same.lost.some((l) => /Spotlight|handwritten/.test(l))).toBe(false)
  })
})

describe('a card\'s title is its name', () => {
  const f = { collections: [], codOn: true, freeShippingAbove: null, returnDays: 7, dispatchDays: 2 }
  const now = new Date('2026-11-09T10:00:00Z')
  const blocks = (cards: object[]) => readinessOf([SectionSchema.parse({ id: 'f', key: 'story_fan', cards })], f, now).filter((x) => x.blocks).map((x) => x.text)
  const img = (alt: string) => ({ base: 'https://x/p', widths: [400], width: 4, height: 5, alt, decorative: false, focus: null })
  it('a titled card needs no photo description; an untitled one does', () => {
    expect(blocks([{ image: img(''), title: 'One' }, { image: img(''), title: 'Two' }, { image: img(''), title: 'Three' }])).toEqual([])
    expect(blocks([{ image: img(''), title: 'One' }, { image: img(''), title: 'Two' }, { image: img(''), title: '' }])).toEqual(['Story fan: describe each untitled card’s photo for people who can’t see it'])
  })
  it('a card with no photo is never judged (it isn\'t shown)', () => {
    expect(blocks([{ image: null, title: '', link: '/products' }])).toEqual([])
  })
})
