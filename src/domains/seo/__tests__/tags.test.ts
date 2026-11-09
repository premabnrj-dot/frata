import { describe, expect, it } from 'vitest'
import { amountOf, pageTags, type PageFacts } from '../tags'

const base: PageFacts = {
  kind: 'product', host: 'kesar-studio.frrata.shop', path: '/products/chanderi-kurta-set', shopName: 'Kesar Studio',
  title: 'Chanderi kurta set | Kesar Studio', shareTitle: 'Chanderi kurta set',
  description: 'Chanderi kurta set in cotton. From ₹2,490, Pay on delivery, 7-day exchange. A very long tail that goes on and on.',
  lang: 'en', indexable: true,
  image: { url: 'https://x/og.jpg', width: 1200, height: 630, alt: 'Rust chanderi kurta set', type: 'image/jpeg' },
  product: { pricePaise: 249000, mrpPaise: 299000, availability: 'in stock', id: 'p1', groupId: 'p1' },
}

describe('pageTags (S1·1: the one writer of a shop page\'s tags)', () => {
  it('a product: og:type product, price from paise, M.R.P. for Pinterest, a large card', () => {
    const t = pageTags(base)
    expect(t.canonical).toBe('https://kesar-studio.frrata.shop/products/chanderi-kurta-set')
    expect(t.og.url).toBe(t.canonical)
    expect(t.og.type).toBe('product')
    expect(t.og.title).toBe('Chanderi kurta set')
    expect(t.og.description!.length).toBeLessThanOrEqual(80)
    expect(t.twitter).toEqual({ card: 'summary_large_image', imageAlt: 'Rust chanderi kurta set' })
    expect(Object.fromEntries(t.product)).toMatchObject({ 'product:price:amount': '2490.00', 'product:price:currency': 'INR', 'product:availability': 'in stock', 'og:price:standard_amount': '2990.00', 'product:brand': 'Kesar Studio' })
    expect(t.robots).toEqual({ index: true, follow: true, maxImagePreview: 'large' })
  })
  it('no M.R.P. tag unless the price is lower; no product tags off a product', () => {
    expect(Object.fromEntries(pageTags({ ...base, product: { ...base.product!, mrpPaise: 249000 } }).product)['og:price:standard_amount']).toBeUndefined()
    const home = pageTags({ ...base, kind: 'home', path: '/', product: undefined })
    expect(home.og.type).toBe('website')
    expect(home.product).toEqual([])
  })
  it('not indexable: noindex and no large-preview hint; no image: a small card; Hindi: hi_IN', () => {
    const t = pageTags({ ...base, indexable: false, image: null, lang: 'hi' })
    expect(t.robots).toEqual({ index: false, follow: false, maxImagePreview: null })
    expect(t.twitter.card).toBe('summary')
    expect(t.og.locale).toBe('hi_IN')
  })
  it('amounts: paise to a two-place decimal', () => {
    expect(amountOf(99)).toBe('0.99')
    expect(amountOf(129900)).toBe('1299.00')
  })
})
