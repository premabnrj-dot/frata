import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAMPLE_PIECES } from '@/domains/themes/catalogue/samples'
import { isListed } from '@/domains/storefront/listing'
import { SAMPLE_SCENES, SAMPLES_BELOW, isSampleHandle, samplePieces, sampleProduct, withSampleImages, withSamples } from '../sample'

// The customizer's sample pieces (plan 2026-11-09-themes-three, task 5; architecture review finding 4).
const now = new Date('2026-11-09T06:00:00Z')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('sample pieces', () => {
  it('every photo they name was drawn (scripts/themes/make-samples.mjs)', () => {
    for (const p of samplePieces()) for (const i of p.images) for (const w of i.widths) expect(existsSync(`public${i.base}-${w}.webp`), `${i.base}-${w}`).toBe(true)
    for (const s of Object.values(SAMPLE_SCENES)) for (const w of s.widths) expect(existsSync(`public${s.base}-${w}.webp`), s.base).toBe(true)
    expect(SAMPLE_PIECES.length).toBe(8)
  })
  it('are listed, marked, and carry nothing the quote or the bag would accept (no uuid ids)', () => {
    for (const p of samplePieces()) {
      expect(p.sample).toBe(true); expect(isListed(p, now)).toBe(true); expect(isSampleHandle(p.handle)).toBe(true)
      for (const v of p.variants) expect(v.id).not.toMatch(UUID)
    }
  })
  it('include one on sale and one sold out, as a real shop would', () => {
    const ps = samplePieces()
    expect(ps.some((p) => p.variants.some((v) => v.compareAt))).toBe(true)
    expect(ps.some((p) => p.variants.every((v) => v.stock === 0))).toBe(true)
  })
})

describe('withSamples', () => {
  const empty = { products: [], collections: [] }
  it('fills a shop listing fewer than SAMPLES_BELOW pieces, after its own; leaves a fuller shop alone', () => {
    expect(withSamples(empty, now).products).toHaveLength(8)
    expect(withSamples(empty, now).collections).toHaveLength(3)
    const full = { products: samplePieces().slice(0, SAMPLES_BELOW), collections: [] }
    expect(withSamples(full, now)).toBe(full)
  })
  it('a sample page only for a sample handle', () => {
    expect(sampleProduct('sample-haldi-kurta')?.title).toBe('Haldi block-print kurta')
    expect(sampleProduct('haldi-kurta')).toBeNull()
  })
  it('a missing photo in the preview gets a scene; one the merchant added stays', () => {
    const t = withSampleImages({ home: [{ id: 'h', key: 'hero', hidden: false, scheme: 'paper', layout: 'image_text', heading: { text: 'A' }, image: null, button: null, position: 'bottom_left', height: 'tall', mask: 'none' }] } as never) as { home: { image: { base: string } | null }[] }
    expect(t.home[0]!.image?.base).toBe('/themes/samples/scene-festive')
  })
})

describe('samples never reach a shop', () => {
  it('only the customizer’s look preview asks for them', () => {
    const users: string[] = []
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && !p.includes('__tests__') && /lib\/themes\/sample'/.test(readFileSync(p, 'utf8'))) users.push(p) } }
    walk('src')
    // The look preview (and its page body), and the customizer's page picker (console only).
    expect(users.sort()).toEqual(['src/app/(lookeditor)/console/look/customize/page.tsx', 'src/app/(lookpreview)/console/theme-preview/[revision]/[[...path]]/page.tsx', 'src/components/storefront/preview-body.tsx'])
    expect(readFileSync('src/lib/queries/storefront.ts', 'utf8')).not.toMatch(/from '@\/lib\/themes\/sample'|withSamples\(/)
  })
})

describe('sample sets by what the shop sells (theme Signal plan S0-1)', () => {
  it('clothing wins; footwear alone is footwear; bags, jewellery or mixed accessories are accessories', async () => {
    const { sampleSetFor } = await import('../sample')
    expect(sampleSetFor(['women', 'footwear'])).toBe('clothing')
    expect(sampleSetFor(['footwear'])).toBe('footwear')
    expect(sampleSetFor(['accessories'])).toBe('accessories')
    expect(sampleSetFor(['jewellery', 'footwear'])).toBe('accessories')
    expect(sampleSetFor([])).toBe('clothing')
    expect(sampleSetFor(['beauty'])).toBe('clothing')
  })
  it('every set has its photos, a first piece and collections of its own pieces; bags are one size, shoes UK sizes, no size chart', async () => {
    const { samplePieces, sampleFirst } = await import('../sample')
    for (const set of ['clothing', 'accessories', 'footwear'] as const) {
      const ps = samplePieces(set)
      expect(ps.length).toBeGreaterThanOrEqual(6)
      for (const p of ps) for (const i of p.images) for (const w of i.widths) expect(existsSync(`public${i.base}-${w}.webp`), `${i.base}-${w}`).toBe(true)
      expect(ps.map((p) => p.handle)).toContain(sampleFirst(set).product)
    }
    expect(samplePieces('accessories')[0]!.optionValues).toEqual([['One size']])
    expect(samplePieces('footwear')[0]!.optionValues[0]![0]).toBe('UK 6')
    expect(samplePieces('footwear')[0]!.sizeChart).toBeNull()
  })
})
