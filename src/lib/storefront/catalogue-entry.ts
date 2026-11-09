import 'server-only'
import type { ShowOffer } from '@/domains/checkout/offer-showcase'
import { WIDTHS } from '@/domains/media/sizes'
import type { StoreCard, StoreCatalogue, StoreCollection, StoreColour, StoreImage, StoreVariant } from '@/lib/queries/storefront'

/**
 * The catalogue as it is CACHED (speed review P1): a list card keeps the photos a list shows (the cover, the second
 * for hover, and each colour's first), and offers are held once with each card naming them by index. A shop-wide
 * offer copied onto 600 cards took the entry past Next's 2 MB limit, past which nothing is cached and every shop page
 * reads Postgres. `catalogue-size.int.test.ts` holds it under 1 MB at 600 products.
 */
export type CachedCard = Omit<StoreCard, 'offers'> & { offerIdx: number[] }
export type CatalogueEntry = { products: CachedCard[]; collections: StoreCollection[]; movedCollections?: Record<string, string>; offers: ShowOffer[]; photoPrefix: string }
/** The photos a list shows: the cover, the second (hover), each colour's first, and any photo a colour's swatch is cut from. */
export const listPhotos = (imgs: StoreImage[], colours: Pick<StoreColour, 'cropImageId'>[] = []): StoreImage[] => {
  const crops = new Set(colours.map((c) => c.cropImageId).filter(Boolean))
  return imgs.filter((im, i) => i < 2 || crops.has(im.id) || (im.optionValue !== null && imgs.findIndex((x) => x.optionValue === im.optionValue) === i))
}

// Empty fields are left out of the cached copy and put back on the way out: most of a variant, photo or colour is
// null or false, and 600 cards × 5 sizes repeat each key name thousands of times. Blanks<T> lists EVERY nullable or
// boolean field of T, so a field added later cannot come back `undefined` without a type error (impact review).
type Blanks<T> = { [K in keyof T as null extends T[K] ? K : T[K] extends boolean ? K : never]-?: null extends T[K] ? null : false }
// A list never shows a SKU (the product page reads its own row), every photo shares its folder's address, and
// most photos have every width we make.
const VARIANT_BLANK: Blanks<StoreVariant> = { sku: null, compareAt: null, mrp: null, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, restockedAt: null }
const IMAGE_BLANK: Blanks<StoreImage> = { optionValue: null }
const COLOUR_BLANK: Blanks<StoreColour> = { family: null, hex: null, cropImageId: null, crop: null }
const dropBlank = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== false)) as T
const fullWidths = (w: number[]) => w.length === WIDTHS.length && w.every((x, k) => x === WIDTHS[k])

/** A card as the cache keeps it. */
export function compactCard(card: Omit<StoreCard, 'offers'>, offerIdx: number[], photoPrefix: string): CachedCard {
  return {
    ...card, offerIdx,
    images: listPhotos(card.images, card.colours).map((im) => dropBlank({ ...im,
      base: photoPrefix && im.base.startsWith(photoPrefix) ? im.base.slice(photoPrefix.length) : im.base,
      widths: fullWidths(im.widths) ? null : im.widths }) as unknown as StoreImage),
    variants: card.variants.map((v) => dropBlank({ ...v, sku: null })),
    colours: card.colours.map(dropBlank),
  }
}
/** The photo folder an entry's photos share (the first photo's), so each keeps only its own name. */
export const photoPrefixOf = (bases: string[]) => { const f = bases[0] ?? ''; return f.startsWith('https://') ? f.slice(0, f.lastIndexOf('/') + 1) : '' }

export const expand = (e: CatalogueEntry): StoreCatalogue => ({
  collections: e.collections, movedCollections: e.movedCollections ?? {},
  products: e.products.map(({ offerIdx, ...c }) => ({
    ...c, offers: offerIdx.map((i) => e.offers[i]!),
    variants: c.variants.map((v) => ({ ...VARIANT_BLANK, ...v })),
    images: c.images.map((im) => ({ ...IMAGE_BLANK, ...im, widths: im.widths ?? [...WIDTHS], base: im.base.startsWith('https://') ? im.base : e.photoPrefix + im.base })),
    colours: c.colours.map((x) => ({ ...COLOUR_BLANK, ...x })),
  })),
})
