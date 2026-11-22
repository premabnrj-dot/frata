// G·4 (Studio plan § G-a; contract review M10): the media origin, a collection's picture, a product's home collection and
// the structured data — additive to 2026-12, parsed by the closed schemas, the store pages' own JSON-LD on the website's
// origin with every `<` escaped, photos only from the store's own folder, no cost.
import { describe, expect, it } from 'vitest'
import { SENTINELS } from '../../../../scripts/cost-sentinels.mjs'
import * as S from '../2026-12/schemas'
import { collectionOut, collectionPageOut, productOut, type CardIn, type CollectionIn, type ProductIn } from '../2026-12/map'
import { collectionLd, homeCollection, productLd, shopLd, type LdShop } from '../2026-12/structured'
import { websiteOrigin } from '../origin'

const T = '11111111-1111-1111-1111-111111111111'
const M = { tenantId: T, mediaHost: 'abc123.public.blob.vercel-storage.com' }
const now = new Date('2026-11-15T06:00:00Z')
const media = (id: string, tenant = T) => `https://abc123.public.blob.vercel-storage.com/tenants/${tenant}/products/${id}`
const costs = Object.fromEntries(SENTINELS.map((k) => [k, 987654321]))
const v = (id: string) => ({ id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`, values: ['M'], price: 249000, compareAt: null, mrp: 299000, stock: 5, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, ...costs })
const card = (n: number, over: Partial<CardIn> = {}): CardIn => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, handle: `kurta-${n}`, title: `Kurta ${n}`, status: 'active', publishAt: null, since: '2026-11-01T00:00:00Z',
  options: ['Size'], images: [{ base: media(`p${n}`), widths: [400, 800], alt: 'Kurta' }], variants: [v(String(n))], colours: [],
  categoryId: null, attributes: {}, tags: ['cotton'], ...costs, ...over,
} as CardIn)
const product = (n: number, over: Partial<ProductIn> = {}): ProductIn => ({ ...card(n), description: 'Hand block print </script><b>', stories: [], pairs: [], sizeChart: null, ...over })
const coll = (handle: string, ids: string[], title = handle): CollectionIn => ({ id: handle, handle, title, description: '', kind: 'manual', matchAll: true, rules: [], sort: 'manual', productIds: ids })
const shop: LdShop = { shopName: 'Kesar <Studio>', logo: null, instagram: 'kesarstudio', codOn: true, returnDays: 7, returnKind: 'exchange_or_refund',
  shippingFlat: 8500, freeShippingAbove: 199900, metroDays: 4, restDays: 7, dispatchDays: 2, zones: null }

describe('G·4: new fields on 2026-12', () => {
  it('the website’s origin is the Website when set, else the store’s own address (ruling C6)', () => {
    expect(websiteOrigin('https://kesarstudio.in', 'https://kesar-studio.frrata.shop')).toBe('https://kesarstudio.in')
    expect(websiteOrigin(null, 'https://kesar-studio.frrata.shop')).toBe('https://kesar-studio.frrata.shop')
  })
  it('G11: a collection’s picture is its first listed product’s first photo; none when it has none', () => {
    const a = card(1, { status: 'draft' }), b = card(2)
    const c = coll('festive', [a.id, b.id])
    const page = S.CollectionPage.parse(collectionPageOut(M, c, [a, b], 1, now))
    expect(page.collection.image?.sizes[0]?.url).toBe(media('p2') + '-400.webp')
    expect(S.Collection.parse(collectionOut(c, { m: M, first: null })).image).toBeNull()
    // a photo from outside the store's own folder is left out, as everywhere
    expect(collectionOut(c, { m: M, first: card(3, { images: [{ base: media('x', '22222222-2222-2222-2222-222222222222'), widths: [400], alt: '' }] }) }).image).toBeNull()
    // the list without covers keeps its old shape (additive)
    expect('image' in collectionOut(c)).toBe(false)
  })
  it('G6: a product’s home collection is the first, in the store’s order, that holds it', () => {
    const p = card(5)
    expect(homeCollection(p, [coll('new', []), coll('kurtas', [p.id], 'Kurtas'), coll('festive', [p.id])], now)).toEqual({ handle: 'kurtas', title: 'Kurtas' })
    expect(homeCollection(p, [coll('new', [])], now)).toBeNull()
    expect(homeCollection(card(6, { status: 'draft' }), [coll('kurtas', [card(6).id])], now)).toBeNull()
    // a rule-based collection holds it by its tags, as on the store
    const auto: CollectionIn = { id: 'cotton', handle: 'cotton', title: 'Cotton', description: '', kind: 'auto', matchAll: true, rules: [{ field: 'tag', op: 'equals', value: 'cotton' }], sort: 'newest', productIds: [] }
    expect(homeCollection(p, [coll('new', []), auto], now)).toEqual({ handle: 'cotton', title: 'Cotton' })
  })
  it('G15: the API’s product JSON-LD is the product page’s own, on the website’s address', async () => {
    const { productJsonLd } = await import('../../seo/defaults')
    const { productLdInput } = await import('../../seo/product-ld')
    const { pick, urlFor } = await import('../../media/sizes')
    const p = product(8, { options: ['Size', 'Colour'], attributes: { 'target-gender': ['female'] }, images: [{ base: media('a'), widths: [400, 800, 1200, 1600], alt: '', optionValue: 'Rani' }] })
    const page = productJsonLd(productLdInput(p, shop, { url: 'https://kesarstudio.in/products/kurta-8', photo: (i) => urlFor(i.base, pick(i.widths, 1200)), now }))
    expect(JSON.parse(productLd(M, p, shop, 'https://kesarstudio.in', now))).toEqual(JSON.parse(JSON.stringify(page)))
  })
  it('G11: every cover at once is each collection’s own cover, in every order (speed review)', async () => {
    const { collectionCover, collectionCovers } = await import('../../storefront/sources')
    const ps = [card(1, { since: '2026-11-03T00:00:00Z', title: 'Beta', tags: ['cotton'] }), card(2, { since: '2026-11-05T00:00:00Z', title: 'Alpha', tags: ['cotton'] }),
      card(3, { status: 'draft', tags: ['cotton'] }), card(4, { since: '2026-11-04T00:00:00Z', title: 'Gamma', tags: ['silk'], variants: [{ ...v('4'), price: 99000 }] })]
    const cs: CollectionIn[] = ['manual', 'newest', 'price_low', 'price_high', 'title'].flatMap((sort) => [
      { ...coll(`m-${sort}`, [ps[3]!.id, ps[0]!.id, ps[2]!.id, ps[1]!.id]), sort },
      { id: `a-${sort}`, handle: `a-${sort}`, title: 'Cotton', description: '', kind: 'auto' as const, matchAll: true, rules: [{ field: 'tag', op: 'equals', value: 'cotton' }], sort, productIds: [] },
    ])
    const all = collectionCovers(cs, ps, now)
    for (const c of cs) expect(all.get(c)?.handle ?? null, c.handle).toBe(collectionCover(c, ps, now)?.handle ?? null)
  })
  it('G15: a product at its 300 sizes still fits the schema', () => {
    const many = product(9, { variants: Array.from({ length: 300 }, (_, i) => ({ ...v(String(1000 + i)), values: [`S${i}`], sku: `KS-KUR-${i}-XXL`, gtin: '89012345678' + String(i % 10) })) })
    const text = productLd(M, many, shop, 'https://kesarstudio.in', now)
    expect(() => S.Product.parse({ ...productOut(M, many, now), collection: null, jsonLd: text })).not.toThrow()
  })
  it('G15: the store pages’ own JSON-LD on the website’s origin, every < escaped, parsed by the schema, no cost', () => {
    const origin = 'https://kesarstudio.in'
    const p = product(7)
    const out = S.Product.parse({ ...productOut(M, p, now), collection: null, jsonLd: productLd(M, p, shop, origin, now) })
    expect(out.jsonLd).not.toContain('<')
    const ld = JSON.parse(out.jsonLd!) as { '@type': string; url: string; image: string[]; brand?: { name: string } }
    expect(ld.url).toBe(`${origin}/products/kurta-7`)
    expect(ld.image).toEqual([media('p7') + '-800.webp'])
    const shopText = shopLd(shop, origin)
    expect(shopText).not.toContain('<')
    expect(JSON.parse(shopText)).toMatchObject({ '@type': 'OnlineStore', url: origin, name: 'Kesar <Studio>', sameAs: ['https://instagram.com/kesarstudio'] })
    const c = coll('festive', [p.id])
    const list = JSON.parse(collectionLd(c, [p], 'Kesar', origin, now)) as { '@type': string; itemListElement: { url?: string; item?: string }[] }[]
    expect(list.map((x) => x['@type'])).toEqual(['BreadcrumbList', 'ItemList'])
    expect(list[1]!.itemListElement[0]!.url).toBe(`${origin}/products/kurta-7`)
    for (const text of [out.jsonLd!, shopText]) { for (const k of SENTINELS) expect(text).not.toContain(k); expect(text).not.toContain('987654321') }
  })
})
