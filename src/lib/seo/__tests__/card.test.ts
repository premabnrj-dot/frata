import { describe, expect, it } from 'vitest'
import { cardHash, collectionCard, parseCardPath, productCard, shopCard } from '../card'
import type { ResolvedTheme } from '@/domains/themes/types'
import type { StoreCard, StoreCatalogue, StoreCollection, StoreShop } from '@/lib/queries/storefront'

const now = new Date('2026-11-09T10:00:00+05:30')
const theme = { schemes: { tint: { bg: '#f3e7d7', text: '#1c1917', sub: '#57534e' } } } as unknown as ResolvedTheme
const shop = { shopName: 'Kesar Studio', codOn: true, returnKind: 'exchange_or_refund', returnDays: 7 } as unknown as StoreShop
const v = (price: number, stock: number, compareAt: number | null = null) => ({ id: `v${price}${stock}`, values: ['M'], sku: null, price, compareAt, mrp: null, stock, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, restockedAt: null }) as unknown as StoreCard['variants'][number]
const img = (n: string) => ({ id: n, base: `https://s.public.blob.vercel-storage.com/tenants/t/products/${n}`, widths: [400, 800, 1200], width: 1200, height: 1500, optionValue: null, alt: '' })
const card = (o: Partial<StoreCard>): StoreCard => ({ id: 'p', handle: 'p', title: 'Chanderi kurta set', status: 'active', publishAt: null, since: '2026-11-01', options: ['Size'], images: [img('a')], variants: [v(249000, 5)], colours: [], categoryId: null, attributes: {}, tags: [], ...o } as unknown as StoreCard)

describe('what a share card shows (S1·2)', () => {
  it('a product: the lowest price a shopper can buy at; a recent cut struck beside it; COD', () => {
    const c = productCard(shop, card({ variants: [v(199000, 0), v(249000, 5, 299000)] }), theme, now)
    expect([c.price, c.was, c.soldOut, c.cod]).toEqual(['₹2,490', '₹2,990', false, true])
    expect(c.photos[0]).toMatch(/-1200\.webp$/)
  })
  it('sold out: says so; a Hindi title is not drawn (og:title carries it)', () => {
    expect(productCard(shop, card({ variants: [v(249000, 0)] }), theme, now).soldOut).toBe(true)
    expect(productCard(shop, card({ title: 'चंदेरी कुर्ता' }), theme, now).title).toBeNull()
  })
  it('a collection: "From ₹… · N styles" from its listed products; a scheduled one is left out', () => {
    const products = [card({ id: 'a', variants: [v(129000, 3)] }), card({ id: 'b', variants: [v(249000, 3)] }), card({ id: 'c', status: 'scheduled', publishAt: '2027-01-01T00:00:00Z' })]
    const col = { id: 'c1', handle: 'f', title: 'Festive edit', description: '', kind: 'manual', matchAll: true, rules: [], sort: 'manual', productIds: ['a', 'b', 'c'] } as unknown as StoreCollection
    const c = collectionCard(shop, col, { products, collections: [col] } as StoreCatalogue, theme, now)
    expect(c.line).toBe('From ₹1,290 · 2 styles')
    expect(c.photos).toHaveLength(2)
  })
  it('the shop: its promises and up to three listed photos', () => {
    const c = shopCard(shop, [card({ id: 'a' }), card({ id: 'b' }), card({ id: 'c' }), card({ id: 'd' })], theme, now)
    expect(c.line).toBe('Pay on delivery · 7-day returns')
    expect(c.photos).toHaveLength(3)
  })
  it('the hash follows what is drawn', () => {
    const a = productCard(shop, card({}), theme, now)
    expect(cardHash(productCard(shop, card({ variants: [v(239000, 5)] }), theme, now))).not.toBe(cardHash(a))
    expect(cardHash(productCard(shop, card({}), theme, now))).toBe(cardHash(a))
  })
})

describe('card addresses (S1·3: only canonical shapes are drawn)', () => {
  const id = '5ef1e555-0ebc-4eda-bfe8-9f22ce6e6738'
  it('accepts the three shapes', () => {
    expect(parseCardPath(['shop', '0123456789abcdef.jpg'])).toEqual({ kind: 'shop', id: null, hash: '0123456789abcdef' })
    expect(parseCardPath(['product', id, '0123456789abcdef.jpg'])).toEqual({ kind: 'product', id, hash: '0123456789abcdef' })
    expect(parseCardPath(['collection', id, '0123456789abcdef.jpg'])?.kind).toBe('collection')
  })
  it('refuses everything else', () => {
    for (const parts of [['shop', id, '0123456789abcdef.jpg'], ['product', '0123456789abcdef.jpg'], ['product', id.toUpperCase(), '0123456789abcdef.jpg'],
      ['product', id, '0123456789ABCDEF.jpg'], ['product', id, '0123456789abcdef.png'], ['product', id, '0123456789abcde.jpg'], ['brand', id, '0123456789abcdef.jpg'],
      ['product', '..', '0123456789abcdef.jpg'], []]) expect(parseCardPath(parts)).toBeNull()
  })
})
