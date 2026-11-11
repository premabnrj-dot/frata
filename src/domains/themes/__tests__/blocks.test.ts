import { describe, expect, it } from 'vitest'
import { DesignSchema, designProblems, designsCheck, pruneFill, resolveDesign, thumbOf, type Design, type RNode } from '../blocks'
import { signal_1_3_0 } from '../catalogue/signal/1.3.0'
import { signal_1_4_0 } from '../catalogue/signal/1.4.0'
import { atelier_1_0_0 } from '../catalogue/atelier/1.0.0'
import { cleanImages } from '../clean-images'
import { carryOver, layerProblems } from '../layer'
import { readinessOf } from '../readiness'
import { resolveTheme } from '../resolve'
import { SectionSchema, type SectionOf } from '../sections'
import { themeCheck } from '../check'

// Theme Studio TS0b (plan docs/plans/2026-11-11-theme-studio-ts0b.md): the block catalogue, a design's merge with the
// owner's words, the save's limits, carry-over between themes, photos and readiness.

const designs = signal_1_4_0.designs!.map((d) => DesignSchema.parse(d))
const size = designs.find((d) => d.id === 'size-help')!, hand = designs.find((d) => d.id === 'made-by-hand')!
const T = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222'
const HOST = 'abc.public.blob.vercel-storage.com'
const photo = (t = T) => ({ base: `https://${HOST}/tenants/${t}/theme/a1b2c3d4-0000-4000-8000-000000000001`, widths: [400], width: 4, height: 5, alt: 'A loafer', decorative: false, focus: null })
const sec = (design: string, fill: object = {}): SectionOf<'design'> => SectionSchema.parse({ id: `d-${design}`, key: 'design', design, fill }) as SectionOf<'design'>
const flat = (ns: RNode[]): RNode[] => ns.flatMap((n) => (n.kind === 'group' || n.kind === 'columns' ? [n, ...flat(n.children)] : [n]))
const facts = { collections: [], codOn: true, freeShippingAbove: null, returnDays: 7, dispatchDays: 2 }

describe('the catalogue', () => {
  it('Signal 1.4 passes the one check, against 1.3 too', () => {
    expect(themeCheck(signal_1_4_0, signal_1_3_0)).toEqual([])
  })
  it('a minor that removes or re-kinds a block is refused', () => {
    const fewer = { ...size, children: [{ ...size.children[0]!, children: [(size.children[0] as { children: unknown[] }).children[0]] }] } as unknown as Design
    expect(designsCheck([fewer, hand], designs).some((p) => p.includes('photo was removed'))).toBe(true)
    const rekinded = JSON.parse(JSON.stringify(hand).replace('"id":"heading","kind":"heading","size":"l","text":"How it’s made"', '"id":"heading","kind":"button","label":"x","link":"/"')) as Design
    expect(designsCheck([size, rekinded], designs).some((p) => p.includes('changed from heading to button'))).toBe(true)
  })
  it.each(['constructor', '__proto__', 'prototype'])('a block can\'t be called %s', (id) => {
    expect(DesignSchema.safeParse({ ...hand, id }).success).toBe(false)
  })
  it('more than three levels can\'t be written', () => {
    const deep = { ...hand, children: [{ id: 'g', kind: 'group', children: [{ id: 'g2', kind: 'group', children: [{ id: 'h', kind: 'heading', size: 's', text: 'x' }] }] }] }
    expect(DesignSchema.safeParse(deep).success).toBe(false)
  })
  it('the library picture stays on its card', () => {
    for (const d of designs) for (const m of thumbOf(d)) { expect(m.x).toBeGreaterThanOrEqual(0); expect(m.x + m.w).toBeLessThanOrEqual(160); expect(m.y + m.h).toBeLessThanOrEqual(100) }
  })
})

describe('resolveDesign', () => {
  it('the shop never shows a sample photo or an example', () => {
    const shop = flat(resolveDesign(size, {}, 'shop'))
    expect(shop.some((n) => n.kind === 'image')).toBe(false)
    expect(shop.some((n) => n.kind === 'text')).toBe(false)
    expect(shop.find((n) => n.kind === 'accordion')).toBeUndefined()
    expect(JSON.stringify(shop)).not.toContain('/themes/samples/')
    // Plain defaults do show: the heading and the button.
    expect(shop.find((n) => n.kind === 'heading')).toMatchObject({ text: 'Find your size', level: 2 })
    expect(shop.find((n) => n.kind === 'button')).toMatchObject({ link: '/policies/returns' })
  })
  it('the preview shows them, marked', () => {
    const pv = flat(resolveDesign(size, {}, 'preview'))
    expect(pv.find((n) => n.kind === 'image')).toMatchObject({ sample: true })
    expect(pv.find((n) => n.kind === 'text')).toMatchObject({ example: true })
    expect((pv.find((n) => n.kind === 'accordion') as { items: { example?: true }[] }).items.every((i) => i.example)).toBe(true)
  })
  it('the owner\'s words and photo replace them; an answer left empty stays off the shop', () => {
    const fill = { intro: { kind: 'text', body: [[{ text: 'True to size.' }]] }, photo: { kind: 'image', image: photo() },
      faq: { kind: 'accordion', items: [{ q: 'Measure?', a: 'In cm.' }, { q: 'Between two?', a: '' }] } }
    const shop = flat(resolveDesign(size, sec('size-help', fill).fill, 'shop'))
    expect(shop.find((n) => n.kind === 'text')).toMatchObject({ body: [[{ text: 'True to size.' }]] })
    expect(shop.find((n) => n.kind === 'image')).toMatchObject({ image: { alt: 'A loafer' } })
    expect(shop.find((n) => n.kind === 'accordion')).toMatchObject({ items: [{ q: 'Measure?', a: 'In cm.' }] })
  })
  it('a fill of another kind on a block id is ignored, and pruned at save', () => {
    const s = sec('size-help', { intro: { kind: 'heading', text: 'Wrong kind' }, gone: { kind: 'heading', text: 'No block' } })
    expect(flat(resolveDesign(size, s.fill, 'shop')).some((n) => n.kind === 'heading' && n.text === 'Wrong kind')).toBe(false)
    expect(pruneFill(size, s).fill).toEqual({})
  })
  it('headings step down: the first h2, the rest h3; one eager photo only where the design opens the page', () => {
    const fill = Object.fromEntries(['1', '2', '3'].flatMap((n) => [[`photo-${n}`, { kind: 'image', image: photo() }], [`heading-${n}`, { kind: 'heading', text: `Step ${n}` }]]))
    const ns = flat(resolveDesign(hand, sec('made-by-hand', fill).fill, 'shop', true))
    expect(ns.filter((n) => n.kind === 'heading').map((n) => (n as { level: number }).level)).toEqual([2, 3, 3, 3])
    expect(ns.filter((n) => n.kind === 'image' && n.eager).length).toBe(1)
    expect(flat(resolveDesign(hand, sec('made-by-hand', fill).fill, 'shop', false)).some((n) => n.kind === 'image' && n.eager)).toBe(false)
  })
})

describe('the save', () => {
  it('a fill record refuses reserved keys and caps its words', () => {
    expect(SectionSchema.safeParse({ id: 'd', key: 'design', design: 'size-help', fill: { constructor: { kind: 'heading', text: 'x' } } }).success).toBe(false)
    expect(SectionSchema.safeParse({ id: 'd', key: 'design', design: 'size-help', fill: { faq: { kind: 'accordion', items: Array.from({ length: 13 }, () => ({ q: 'q', a: 'a' })) } } }).success).toBe(false)
    expect(SectionSchema.safeParse({ id: 'd', key: 'design', design: 'size-help', fill: { b: { kind: 'button', label: 'Go', link: 'https://evil.example' } } }).success).toBe(false)
  })
  it('at most four designs a page; a design the theme lacks is refused', () => {
    expect(layerProblems({ home: Array.from({ length: 5 }, (_, i) => ({ ...sec('size-help'), id: `d${i}` })) })).toContain('Design: at most 4 on a page')
    expect(designProblems(designs, [sec('nope')])[0]).toMatch(/isn’t in this theme/)
  })
  it('words are counted in bytes (Devanagari is three a character)', () => {
    const long = 'क'.repeat(600)
    const fill = { faq: { kind: 'accordion', items: Array.from({ length: 12 }, () => ({ q: 'q', a: long })) } }
    const four = Array.from({ length: 4 }, (_, i) => ({ ...sec('size-help', fill), id: `d${i}` }))
    expect(designProblems(designs, four).some((p) => p.includes('too long'))).toBe(true)
  })
  it('every photo in a fill is this shop\'s own (cleanImages, by kind)', () => {
    const ok = { home: [sec('size-help', { photo: { kind: 'image', image: photo() } })] }
    expect(cleanImages(ok, T, HOST)).not.toBeNull()
    expect(cleanImages({ home: [sec('size-help', { photo: { kind: 'image', image: photo(OTHER) } })] }, T, HOST)).toBeNull()
    expect(cleanImages({ home: [sec('size-help', { photo: { kind: 'image', image: { ...photo(), base: 'https://evil.example/x' } } })] }, T, HOST)).toBeNull()
  })
})

describe('resolve and carry-over', () => {
  it('a 1.4 look keeps its design; 1.3 drops it', () => {
    const layer = { style: 'cobalt', home: [sec('size-help')] }
    expect(resolveTheme(signal_1_4_0, layer).designs?.['size-help']?.name).toBe('Size help')
    expect(resolveTheme(signal_1_3_0, layer).home.some((s) => s.key === 'design')).toBe(false)
  })
  it('trying 1.3 or another theme says which design is lost', () => {
    const from = { manifest: signal_1_4_0, layer: { style: 'cobalt', home: [sec('size-help')] } }
    expect(carryOver(from, signal_1_3_0).lost).toContain('Size help isn\'t in Signal 1.3.0')
    expect(carryOver(from, atelier_1_0_0).lost).toContain('Size help isn\'t in Atelier')
    expect(carryOver(from, { ...signal_1_4_0, version: '1.5.0' }).layer.home).toHaveLength(1)
  })
})

describe('readiness', () => {
  it('examples block Publish, by name; a photo not added only leaves its block out', () => {
    const issues = readinessOf([sec('size-help')], facts, new Date(), { 'size-help': size })
    expect(issues.filter((i) => i.blocks).map((i) => i.text)).toEqual([
      'Size help: write your own words for “How your sizes run”',
      'Size help: write your own answer for “How do I measure my foot?”',
      'Size help: write your own answer for “I’m between two sizes”',
      'Size help: write your own answer for “Can I exchange the size?”',
    ])
    expect(issues.find((i) => !i.blocks)?.text).toBe('Size help: add a photo for “Photo”, or it’s left out')
  })
  it('filled, nothing blocks; a photo without a description does', () => {
    const fill = { intro: { kind: 'text', body: [[{ text: 'True to size.' }]] }, faq: { kind: 'accordion', items: [{ q: 'Measure?', a: 'In cm.' }] }, photo: { kind: 'image', image: { ...photo(), alt: '' } } }
    expect(readinessOf([sec('size-help', fill)], facts, new Date(), { 'size-help': size }).map((i) => i.text)).toEqual(['Size help: describe “Photo” for people who can’t see it'])
  })
})
