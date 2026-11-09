import { describe, expect, it } from 'vitest'
import { CATALOGUE, manifestOf } from '../catalogue'
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
