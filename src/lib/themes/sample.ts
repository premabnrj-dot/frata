import 'server-only'
import { isListed } from '@/domains/storefront/listing'
import type { StoreCard, StoreCatalogue, StoreCollection, StoreProduct } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/lib/themes/sample.ts — the customizer's sample pieces (plan 2026-11-09-themes-three, task 5).
// A shop with fewer than SAMPLES_BELOW listed pieces sees these in its DRAFT PREVIEW only, so a theme can be judged
// before the catalogue exists. Never on a shop: only the theme preview route asks for them (withSamples), they are
// merged after the preview read (never inside a cached read), their variant ids are not uuids (the quote and the
// bag refuse them), and their photos are files on the console host (scripts/themes/make-samples.mjs), which a shop
// host can't serve. A theme opts in with manifest.samples.
// =============================================================================

export const SAMPLES_BELOW = 4
export const SAMPLE_PREFIX = 'sample-'
export const isSampleHandle = (h: string) => h.startsWith(SAMPLE_PREFIX)

import { SAMPLE_PIECES as PIECES, type SamplePiece as Piece } from '@/domains/themes/catalogue/samples'
const SIZES = ['S', 'M', 'L', 'XL']
const CHART = { columns: ['Bust', 'Waist', 'Hip'], rows: [{ size: 'S', values: [86, 71, 94] }, { size: 'M', values: [91, 76, 99] }, { size: 'L', values: [97, 81, 104] }, { size: 'XL', values: [102, 86, 109] }], howToMeasure: 'Measure around the fullest part, tape level, over light clothing.' }

const card = (p: Piece, i: number): StoreProduct => {
  const id = `${SAMPLE_PREFIX}${p.name}`
  const img = (tag: string, n: number) => ({ id: `${id}-img-${n}`, base: `/themes/samples/${p.name}${tag}`, widths: [400, 800], width: 800, height: 1000, optionValue: null, alt: '' })
  const sizes = p.type === 'saree' ? ['Free size'] : SIZES
  return {
    id, handle: id, title: p.title, status: 'active', publishAt: null, // Dated long ago, so a shop's own pieces always come first in New in.
    since: new Date(Date.UTC(2020, 0, 1) - p.days * 86_400_000).toISOString(),
    options: ['Size'], images: [img('', 0), img('-b', 1), img('-d', 2)],
    variants: sizes.map((s, j) => ({ id: `${id}-v${j}`, values: [s], sku: null, price: p.price, compareAt: p.was ?? null, mrp: null, stock: p.soldOut || (i === 0 && s === 'XL') ? 0 : 8, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, restockedAt: null })),
    colours: [{ value: p.colour, family: null, hex: p.hex, cropImageId: null, crop: null }],
    categoryId: null, attributes: {}, tags: [], description: p.about, modelHeight: '', modelSize: '', optionValues: [sizes], seoTitle: '', seoDescription: '',
    typeName: null, sizeChart: p.type === 'saree' ? null : CHART, sample: true,
  }
}

/** The sample pieces, newest first. */
export const samplePieces = (): StoreProduct[] => PIECES.map((p, i) => card(p, i))
/** What the customizer's page picker opens when the shop has none of its own (and samples apply). */
export const SAMPLE_FIRST = { product: `${SAMPLE_PREFIX}${PIECES[0]!.name}`, collection: `${SAMPLE_PREFIX}kurtas` }
/** Do samples apply: a shop listing fewer than SAMPLES_BELOW pieces. */
export const needsSamples = (listed: number) => listed < SAMPLES_BELOW
const COLLECTIONS: [string, string, string[]][] = [
  ['kurtas', 'Kurtas', ['haldi-kurta', 'indigo-dabu', 'ivory-chikan']],
  ['occasion', 'Occasion', ['rani-anarkali', 'mehndi-saree']],
  ['everyday', 'Everyday', ['terracotta-coord', 'black-linen-shirt', 'sky-maxi']],
]
const sampleCollections = (): StoreCollection[] => COLLECTIONS.map(([h, title, names]) => ({ id: `${SAMPLE_PREFIX}c-${h}`, handle: `${SAMPLE_PREFIX}${h}`, title, description: '', seoTitle: '', seoDescription: '', kind: 'manual', matchAll: true, rules: [], sort: 'manual', productIds: names.map((n) => `${SAMPLE_PREFIX}${n}`) }))

/** The preview's catalogue: the shop's own, then the samples when it lists fewer than SAMPLES_BELOW pieces. */
export function withSamples(cat: StoreCatalogue, now: Date): StoreCatalogue {
  if (!needsSamples(cat.products.filter((p) => isListed(p, now)).length)) return cat
  const cards: StoreCard[] = samplePieces()
  return { products: [...cat.products, ...cards], collections: cat.collections.length >= 2 ? cat.collections : [...cat.collections, ...sampleCollections()] }
}

/** A sample piece's page in the preview: only when the shop has no real product at this handle. */
export const sampleProduct = (handle: string): StoreProduct | null => samplePieces().find((p) => p.handle === handle) ?? null

/** Photos for a Hero or Image with text that has none yet, in the preview of a theme with samples. */
export const SAMPLE_SCENES = {
  festive: { base: '/themes/samples/scene-festive', widths: [800, 1600], width: 1600, height: 1000, alt: '', decorative: true },
  studio: { base: '/themes/samples/scene-studio', widths: [800, 1600], width: 1600, height: 1000, alt: '', decorative: true },
  piece: { base: '/themes/samples/rani-anarkali', widths: [400, 800], width: 800, height: 1000, alt: '', decorative: true },
}

/** The preview's theme: a photo Hero or an Image with text that has no photo yet shows a sample scene (the shop
 *  itself still needs the merchant's photo before Publish: readiness is unchanged). */
export function withSampleImages<T extends { home: import('@/domains/themes/sections').SectionInstance[] }>(t: T, look: 'festive' | 'studio' = 'festive'): T {
  const scene = SAMPLE_SCENES[look]
  return { ...t, home: t.home.map((s) => s.key === 'hero' && s.layout !== 'text' && !s.image ? { ...s, image: scene }
    : (s.key === 'image_text' || s.key === 'shop_the_look') && !s.image ? { ...s, image: SAMPLE_SCENES.piece } : s) }
}
