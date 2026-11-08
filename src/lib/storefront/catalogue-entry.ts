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
export type CatalogueEntry = { products: CachedCard[]; collections: StoreCollection[]; offers: ShowOffer[]; photoPrefix: string }
export const listPhotos = (imgs: StoreImage[]): StoreImage[] => imgs.filter((im, i) => i < 2 || (im.optionValue !== null && imgs.findIndex((x) => x.optionValue === im.optionValue) === i))
// Empty fields are left out of the cached copy and put back on the way out: most of a variant, photo or colour is
// null or false, and 600 cards × 5 sizes repeat each key name thousands of times.
// A list never shows a SKU (the product page reads its own row), every photo shares its folder's address, and
// most photos have every width we make.
const VARIANT_BLANK = { sku: null, compareAt: null, mrp: null, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, restockedAt: null } satisfies Partial<StoreVariant>
const IMAGE_BLANK = { optionValue: null, widths: [...WIDTHS] } satisfies Partial<StoreImage>
const COLOUR_BLANK = { family: null, hex: null, cropImageId: null, crop: null } satisfies Partial<StoreColour>
export const dropBlank = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== false)) as T
export const expand = (e: CatalogueEntry): StoreCatalogue => ({
  collections: e.collections,
  products: e.products.map(({ offerIdx, ...c }) => ({
    ...c, offers: offerIdx.map((i) => e.offers[i]!),
    variants: c.variants.map((v) => ({ ...VARIANT_BLANK, ...v })),
    images: c.images.map((im) => ({ ...IMAGE_BLANK, ...im, base: im.base.startsWith('https://') ? im.base : e.photoPrefix + im.base })), colours: c.colours.map((x) => ({ ...COLOUR_BLANK, ...x })),
  })),
})

