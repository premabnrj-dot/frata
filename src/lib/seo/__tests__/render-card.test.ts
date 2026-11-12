import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { cardHash, cardPath, type CardContent } from '../card'
import { MAX_BYTES, photoUri, renderCard } from '../render-card'

const colours = { bg: '#f3e7d7', text: '#1c1917', sub: '#57534e' }
const product: CardContent = { kind: 'product', title: 'Chanderi kurta set', shopName: 'Kesar Studio', price: '₹2,490', was: '₹2,990', soldOut: false, cod: true, line: null, photos: ['https://x/a-1200.webp'], colours }
const webp = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#b45f3c' } }).webp().toBuffer()

describe('share cards (S1·3–S1·4)', () => {
  it('a product card: a 1200×630 JPEG under 300 KB', async () => {
    const uri = await photoUri(await webp(1200, 1500), 1200, 630)
    expect(uri).toMatch(/^data:image\/jpeg;base64,/)
    const jpg = await renderCard(product, [uri!])
    expect(jpg).not.toBeNull()
    const m = await sharp(jpg!).metadata()
    expect([m.format, m.width, m.height]).toEqual(['jpeg', 1200, 630])
    expect(jpg!.length).toBeLessThanOrEqual(MAX_BYTES)
  }, 30_000)
  it('the shop card with no photos, a sold-out product, a collection without photos', async () => {
    for (const c of [
      { ...product, kind: 'shop', title: null, price: null, was: null, line: 'Pay on delivery · 7-day returns', photos: [] },
      { ...product, soldOut: true, photos: [] },
      { ...product, kind: 'collection', price: null, was: null, line: 'From ₹1,290 · 24 styles', photos: [] },
    ] as CardContent[]) {
      const jpg = await renderCard(c, [])
      expect((await sharp(jpg!).metadata()).format).toBe('jpeg')
    }
  }, 30_000)
  it('photos: only a sane WebP or JPEG is drawn (not a PNG, not a giant)', async () => {
    // A JPEG photo (Safari makes no WebP, 2026-11-12).
    expect(await photoUri(await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#b45f3c' } }).jpeg().toBuffer(), 100, 100)).toMatch(/^data:image\/jpeg;base64,/)
    expect(await photoUri(await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer(), 100, 100)).toBeNull()
    expect(await photoUri(Buffer.from('not an image'), 100, 100)).toBeNull()
    expect(await photoUri(await webp(3000, 3000), 100, 100)).toBeNull()
  }, 30_000)
  it('the hash changes with what is drawn; the shop card has no id in its address', () => {
    expect(cardHash(product)).toMatch(/^[0-9a-f]{16}$/)
    expect(cardHash({ ...product, price: '₹2,390' })).not.toBe(cardHash(product))
    expect(cardPath({ ...product, kind: 'shop' }, 'x')).toMatch(/^\/og\/shop\/[0-9a-f]{16}\.jpg$/)
    expect(cardPath(product, '5ef1e555-0ebc-4eda-bfe8-9f22ce6e6738')).toMatch(/^\/og\/product\/5ef1e555-0ebc-4eda-bfe8-9f22ce6e6738\/[0-9a-f]{16}\.jpg$/)
  })
})
