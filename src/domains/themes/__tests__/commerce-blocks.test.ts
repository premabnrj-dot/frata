import { describe, expect, it } from 'vitest'
import { DesignSchema, MAX_LOOPS, designProblems, designsCheck, designsForSave, resolveDesign, type Design, type RNode } from '../blocks'
import { signal_1_4_0 } from '../catalogue/signal/1.4.0'
import { signal_1_5_0 } from '../catalogue/signal/1.5.0'
import { themeCheck } from '../check'
import { cleanFill } from '../clean-images'
import { readinessOf } from '../readiness'
import { resolveTheme } from '../resolve'
import { FillSchema, SectionSchema, type SectionOf } from '../sections'
import { PageDraftSchema } from '@/domains/pages/templates'
import { prunePage } from '@/domains/pages/page'

// Theme Studio TS1b (docs/plans/2026-11-11-theme-studio-ts1.md § TS1b): the commerce, video and date blocks, Signal
// 1.5's four designs, the video rule, the page's limits (≤ 2 commerce designs, ≤ 3 loops), the eager budget.

const designs = signal_1_5_0.designs!.map((d) => DesignSchema.parse(d))
const by = (id: string) => designs.find((d) => d.id === id)!
const VID = { id: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b' }
const T = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222'
const HOST = 'abc.public.blob.vercel-storage.com'
const photo = (t = T) => ({ base: `https://${HOST}/tenants/${t}/theme/a1b2c3d4-0000-4000-8000-000000000001`, widths: [400], width: 4, height: 5, alt: 'On the bench', decorative: false, focus: null })
const sec = (design: string, fill: object = {}, extra: object = {}): SectionOf<'design'> => SectionSchema.parse({ id: `d-${design}`, key: 'design', design, fill, ...extra }) as SectionOf<'design'>
const flat = (ns: RNode[]): RNode[] => ns.flatMap((n) => (n.kind === 'group' || n.kind === 'columns' ? [n, ...flat(n.children)] : [n]))
const NOW = new Date('2026-11-11T10:00:00Z')
const SAVE = { now: NOW, videoOk: ['hero', 'image_text', 'design'], loopsBefore: 0 }
const facts = (cs: [string, boolean][] = []) => ({ collections: cs.map(([handle, hasProducts]) => ({ handle, hasProducts })), codOn: true, freeShippingAbove: null, returnDays: 7, dispatchDays: 2 })

describe('Signal 1.5', () => {
  it('passes the one check, against 1.4 too (a minor only adds)', () => expect(themeCheck(signal_1_5_0, signal_1_4_0)).toEqual([]))
  it('offers video in designs; 1.4 never did', () => {
    expect(signal_1_5_0.allowed.videoSections).toContain('design')
    expect(signal_1_4_0.allowed.videoSections ?? []).not.toContain('design')
  })
})

describe('resolving the blocks', () => {
  it('on the shop: no piece picked, no date, no poster → the block is left out (the video waits for the section)', () => {
    const shop = flat(resolveDesign(by('one-piece'), {}, 'shop')).map((n) => n.kind)
    expect(shop).not.toContain('featured_product')
    expect(flat(resolveDesign(by('the-drop'), {}, 'shop')).map((n) => n.kind)).not.toContain('date')
    const v = flat(resolveDesign(by('behind-the-bench'), {}, 'shop')).find((n) => n.kind === 'video')
    expect(v).toMatchObject({ poster: null })
  })
  it('in the preview: the theme\'s sample poster, marked; a featured piece not yet picked asks the renderer for one', () => {
    const v = flat(resolveDesign(by('behind-the-bench'), {}, 'preview')).find((n) => n.kind === 'video')
    expect(v).toMatchObject({ sample: true })
    expect(flat(resolveDesign(by('one-piece'), {}, 'preview')).find((n) => n.kind === 'featured_product')).toMatchObject({ handle: null })
  })
  it('the owner\'s choices win: source, piece, picks, date', () => {
    const drop = flat(resolveDesign(by('the-drop'), { pieces: { kind: 'product_grid', source: { kind: 'collection', handle: 'monsoon' } }, date: { kind: 'date', at: '2026-11-14T19:00:00+05:30' } }, 'shop'))
    expect(drop.find((n) => n.kind === 'product_grid')).toMatchObject({ source: { kind: 'collection', handle: 'monsoon' } })
    expect(drop.find((n) => n.kind === 'date')).toMatchObject({ at: '2026-11-14T19:00:00+05:30' })
    const edits = flat(resolveDesign(by('the-edits'), { tiles: { kind: 'collection_tiles', mode: 'picked', handles: ['a', 'b'] } }, 'shop'))
    expect(edits.find((n) => n.kind === 'collection_tiles')).toMatchObject({ handles: ['a', 'b'], shape: 'circle' })
    // Picked with none picked shows nothing on the shop (auto on the preview, so the owner sees the block).
    expect(flat(resolveDesign(by('the-edits'), { tiles: { kind: 'collection_tiles', mode: 'picked', handles: [] } }, 'shop')).some((n) => n.kind === 'collection_tiles')).toBe(false)
  })
  it('a lead design loads ≤ 2 images ahead, its own photo ≤ 1; a design further down none', () => {
    const eager = (d: Design, fill: object, lead: boolean) => flat(resolveDesign(d, fill as never, 'shop', lead)).reduce((n, x) => n + (x.kind === 'product_grid' ? x.eager ?? 0 : 'eager' in x && x.eager ? 1 : 0), 0)
    expect(eager(by('the-drop'), {}, true)).toBe(2)
    expect(eager(by('one-piece'), { photo: { kind: 'image', image: photo() }, piece: { kind: 'featured_product', handle: 'kurta' } }, true)).toBe(2)
    expect(eager(by('one-piece'), { photo: { kind: 'image', image: photo() }, piece: { kind: 'featured_product', handle: 'kurta' } }, false)).toBe(0)
    expect(eager(signal_1_4_0.designs!.map((d) => DesignSchema.parse(d)).find((d) => d.id === 'made-by-hand')!, { 'photo-1': { kind: 'image', image: photo() }, 'photo-2': { kind: 'image', image: photo() } }, true)).toBe(1)
  })
})

describe('the video rule (architecture blocker 1)', () => {
  it('a design with no video block can neither play nor keep a loop; one with its video block keeps it where offered', () => {
    const r = designsForSave(designs, [sec('the-drop', {}, { video: VID }), sec('behind-the-bench', {}, { video: VID })], SAVE)
    expect('home' in r && (r.home as SectionOf<'design'>[]).map((s) => s.video ?? null)).toEqual([null, VID])
    const off = designsForSave(designs, [sec('behind-the-bench', {}, { video: VID })], { ...SAVE, videoOk: ['hero', 'image_text'] })
    expect('home' in off && (off.home[0] as SectionOf<'design'>).video).toBeUndefined()
  })
  it('resolve drops it the same way: 1.4 (no design video) never renders one, 1.5 does', () => {
    const home = [{ id: 'b', key: 'design', design: 'behind-the-bench', video: VID }, { id: 'd', key: 'design', design: 'the-drop', video: VID }]
    const r = resolveTheme(signal_1_5_0, { style: signal_1_5_0.styles[0]!.key, home }).home as SectionOf<'design'>[]
    expect(r.map((s) => s.video ?? null)).toEqual([VID, null])
    const old = resolveTheme(signal_1_4_0, { style: signal_1_4_0.styles[0]!.key, home: [{ id: 's', key: 'design', design: 'size-help', video: VID }] }).home as SectionOf<'design'>[]
    expect(old[0]!.video).toBeUndefined()
  })
})

describe('the page\'s limits', () => {
  const hero = (i: number) => ({ id: `h${i}`, key: 'hero', layout: 'image', heading: { text: 'x' }, video: VID })
  it(`a Home plays at most ${MAX_LOOPS} loops: the save refuses a 4th, and a look already past it keeps its loops`, () => {
    const four = [hero(1), hero(2), { id: 's', key: 'image_text', heading: 'x', video: VID }, sec('behind-the-bench', {}, { video: VID })]
    expect(designsForSave(designs, four, SAVE)).toEqual({ error: 'A Home plays at most 3 videos. Remove one first.' })
    expect('home' in designsForSave(designs, four, { ...SAVE, loopsBefore: 4 })).toBe(true)
    // A hidden section's loop doesn't play, so it isn't counted; nor one where the theme doesn't offer video.
    expect('home' in designsForSave(designs, [...four.slice(0, 3), { ...hero(4), hidden: true }], SAVE)).toBe(true)
    expect('home' in designsForSave(designs, four, { ...SAVE, videoOk: ['hero'] })).toBe(true)
  })
  it('at most 2 designs with pieces or collections on a page; others are free', () => {
    const three = ['the-drop', 'one-piece', 'the-edits'].map((d) => sec(d))
    expect(designProblems(designs, three)).toEqual(['At most 2 designs with pieces or collections on a page. Hide or remove one.'])
    expect(designProblems(designs, [...three.slice(0, 2), sec('behind-the-bench'), sec('size-help')])).toEqual([])
    expect(designProblems(designs, [three[0]!, three[1]!, { ...three[2]!, hidden: true }])).toEqual([])
  })
  it('a drop date more than 400 days away is refused in words', () => {
    const far = sec('the-drop', { date: { kind: 'date', at: '2028-01-01T19:00:00+05:30' } })
    expect(designsForSave(designs, [far], SAVE)).toEqual({ error: 'A drop date can be at most 400 days away. Pick a nearer one.' })
    expect('home' in designsForSave(designs, [sec('the-drop', { date: { kind: 'date', at: '2026-12-01T19:00:00+05:30' } })], SAVE)).toBe(true)
  })
  it('a product grid shows the board\'s 4: no count to send', () => {
    expect(FillSchema.safeParse({ kind: 'product_grid', source: { kind: 'newest' }, count: 24 }).data).toEqual({ kind: 'product_grid', source: { kind: 'newest' } })
    expect(FillSchema.safeParse({ kind: 'collection_tiles', mode: 'picked', handles: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(false)
    expect(FillSchema.safeParse({ kind: 'collection_tiles', mode: 'picked', handles: ['a', 'a'] }).success).toBe(false)
  })
})

describe('themeCheck (architecture 10)', () => {
  const one = by('one-piece')
  it('what only the owner chooses must be theirs to fill; a grid can\'t default to a collection; one video a design', () => {
    const unfilled = JSON.parse(JSON.stringify(one).replace('"kind":"featured_product","fill":{"label":"Piece"}', '"kind":"featured_product"')) as Design
    expect(designsCheck([unfilled])).toContain('Design one-piece: piece must be filled by the owner')
    const drop = JSON.parse(JSON.stringify(by('the-drop')).replace('"source":{"kind":"newest"}', '"source":{"kind":"collection","handle":"x"}')) as Design
    expect(designsCheck([drop])).toContain('Design the-drop: pieces can\'t default to a collection')
    const bench = by('behind-the-bench')
    const two = { ...bench, children: [...bench.children, { id: 'v2', kind: 'video', ratio: '1:1', poster: null, fill: { label: 'V' } }] } as Design
    expect(designsCheck([two])).toContain('Design behind-the-bench: at most one video')
  })
  it('a minor can\'t add pieces or a video to a design already on shops', () => {
    const size = signal_1_4_0.designs!.map((d) => DesignSchema.parse(d)).find((d) => d.id === 'size-help')!
    const grown = { ...size, children: [...size.children, { id: 'more', kind: 'product_grid', source: { kind: 'newest' } }] } as Design
    expect(designsCheck([grown], [size]).some((p) => p.includes('a minor can\'t add pieces, collections or a video'))).toBe(true)
  })
})

describe('photos and readiness', () => {
  it('a poster is a photo: from another shop, the save is refused', () => {
    expect(cleanFill({ video: { kind: 'video', poster: photo(OTHER) } }, T, HOST)).toBeNull()
    expect(cleanFill({ video: { kind: 'video', poster: photo() } }, T, HOST)).not.toBeNull()
  })
  it('says what is missing; only fewer than 2 picks and an undescribed poster block Publish', () => {
    const r = (s: SectionOf<'design'>, cs: [string, boolean][] = []) => readinessOf([s], facts(cs), NOW, Object.fromEntries(designs.map((d) => [d.id, d])))
    expect(r(sec('the-drop')).map((i) => [i.blocks, i.text])).toEqual([[false, 'The drop: set a date for “Drop date”, or it’s left out']])
    expect(r(sec('the-drop', { date: { kind: 'date', at: '2026-11-01T10:00:00Z' } }))[0]!.text).toBe('The drop: its date has passed, so “Drop date” is left out')
    expect(r(sec('one-piece', { words: { kind: 'text', body: [[{ text: 'Mine.' }]] } })).map((i) => i.text)).toEqual(['One piece: add a photo for “Photo”, or it’s left out', 'One piece: pick a piece for “Piece”, or it’s left out'])
    expect(r(sec('the-edits', { tiles: { kind: 'collection_tiles', mode: 'picked', handles: ['a', 'gone'] } }), [['a', true]]).map((i) => [i.blocks, i.text]))
      .toEqual([[false, 'The edits: a collection it shows was deleted for “Collections”'], [true, 'The edits: pick at least 2 collections with products for “Collections”']])
    const bench = r(sec('behind-the-bench', { story: { kind: 'text', body: [[{ text: 'Mine.' }]] }, video: { kind: 'video', poster: { ...photo(), alt: '' } } }))
    expect(bench.filter((i) => i.blocks).map((i) => i.text)).toEqual(['Behind the bench: describe “Video” for people who can’t see it'])
    expect(r(sec('behind-the-bench', { story: { kind: 'text', body: [[{ text: 'Mine.' }]] } }, { video: VID })).map((i) => i.text)).toEqual([])
  })
})

describe('pages (security LOW-4)', () => {
  it('a page\'s fill parses with a commerce fill, and the page drops it (About and FAQ have no such block)', () => {
    const d = PageDraftSchema.parse({ title: 'Our story', handle: 'our-story', fill: { x: { kind: 'featured_product', handle: 'kurta' }, y: { kind: 'video', poster: null } } })
    expect(prunePage('about', d).fill).toEqual({})
  })
})
