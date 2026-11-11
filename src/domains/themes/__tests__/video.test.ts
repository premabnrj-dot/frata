import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { codeSource, manifestOf as manifestIn } from '../source'
const manifestOf = (k: string, v: string) => manifestIn(codeSource, k, v)
import { carryOver } from '../layer'
import { resolveTheme } from '../resolve'
import { readinessOf } from '../readiness'
import { SectionSchema } from '../sections'

// V1: a loop shows only in a theme that lists the section in allowed.videoSections (Signal 1.1.0: hero, image_text).
const VID = { id: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b' }
const home = [
  { id: 'hero', key: 'hero', layout: 'image_text', heading: { text: 'Roam' }, video: VID },
  { id: 'story', key: 'image_text', heading: 'Why Roam', video: VID },
]
const videoOf = (key: string, version: string) =>
  resolveTheme(manifestOf(key, version)!, { style: manifestOf(key, version)!.styles[0]!.key, home }).home.map((s) => ('video' in s ? s.video ?? null : null))

describe('video only where the theme offers it', () => {
  it('Signal 1.1.0 keeps the loop in the hero and the story', () => expect(videoOf('signal', '1.1.0')).toEqual([VID, VID]))
  it('Signal 1.0.0, released before video, never renders one', () => expect(videoOf('signal', '1.0.0')).toEqual([null, null]))
  it('no other theme renders one', () => {
    for (const vs of Object.values(CATALOGUE)) for (const m of Object.values(vs)) {
      if (m.allowed.videoSections?.length) continue
      const r = resolveTheme(m, { style: m.styles[0]!.key, home })
      expect(r.home.some((s) => 'video' in s && s.video)).toBe(false)
    }
  })
  it('a section with no video stays as it was (no key added)', () => {
    const r = resolveTheme(manifestOf('signal', '1.1.0')!, { style: 'cobalt', home: [{ id: 'hero', key: 'hero', heading: { text: 'x' } }] })
    expect('video' in r.home[0]!).toBe(false)
  })
})

describe('trying another theme', () => {
  it('keeps the sections, says the videos won’t show, and the photos do', () => {
    const r = carryOver({ manifest: manifestOf('signal', '1.1.0')!, layer: { style: 'cobalt', home } }, manifestOf('editorial', '2.1.0')!)
    expect(r.lost).toContain('Videos aren’t in Editorial; the photos show'.replace('’', "'"))
    expect((r.layer.home ?? []).length).toBe(2)
  })
  it('says nothing when the new theme offers video there too', () => {
    const r = carryOver({ manifest: manifestOf('signal', '1.0.0')!, layer: { style: 'cobalt', home } }, manifestOf('signal', '1.1.0')!)
    expect(r.lost.some((l) => l.startsWith('Videos'))).toBe(false)
  })
})

describe('a video stands in for the photo', () => {
  const f = { collections: [], codOn: true, freeShippingAbove: null, returnDays: 7, dispatchDays: 2 }
  const now = new Date('2026-11-09T10:00:00Z')
  const blocks = (s: object) => readinessOf([SectionSchema.parse(s)], f, now).filter((x) => x.blocks).map((x) => x.text)
  it('a Hero or Image with text with a video needs no photo (nor a description of one)', () => {
    expect(blocks({ id: 'h', key: 'hero', layout: 'image_text', heading: { text: 'Roam' }, video: VID })).toEqual([])
    expect(blocks({ id: 's', key: 'image_text', heading: 'Why', video: VID })).toEqual([])
  })
  it('with neither, it asks for one or the other', () => {
    expect(blocks({ id: 'h', key: 'hero', layout: 'image_text', heading: { text: 'Roam' } })).toEqual(['Hero: add a photo or a video'])
    expect(blocks({ id: 's', key: 'image_text', heading: 'Why' })).toEqual(['Image with text: add a photo or a video'])
  })
})
