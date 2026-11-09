import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const { compactCard, expand, photoPrefixOf } = await import('../catalogue-entry')

const base = (n: string) => `https://abc.public.blob.vercel-storage.com/tenants/t1/products/${n}`
const img = (id: string, extra = {}) => ({ id, base: base(id), widths: [400, 800, 1200, 1600], width: 1600, height: 2000, optionValue: null as string | null, alt: '', ...extra })
const card = {
  id: 'p1', handle: 'kurta', title: 'Kurta', status: 'active', publishAt: null, since: '2026-11-01T00:00:00.000Z', options: ['Size', 'Colour'],
  categoryId: null, tags: [], attributes: { fabric: ['cotton'] },
  images: [img('a', { optionValue: 'Rani' }), img('b'), img('c', { widths: [400, 800] }), img('d', { optionValue: 'Neel' }), img('e')],
  variants: [{ id: 'v1', values: ['M', 'Rani'], sku: 'K-M', gtin: null, price: 129900, compareAt: null, mrp: 149900, stock: 3, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, restockedAt: null }],
  colours: [{ value: 'Rani', family: 'pink', hex: '#d61f69', cropImageId: 'e', crop: { x: 0.5, y: 0.5, r: 0.2 } }, { value: 'Neel', family: null, hex: null, cropImageId: null, crop: null }],
}

describe('the cached catalogue card (speed review P1, impact review)', () => {
  it('comes back as it went in: list photos only, no SKU, offers by index', () => {
    const prefix = photoPrefixOf(card.images.map((i) => i.base))
    const out = expand({ photoPrefix: prefix, collections: [], offers: [{ label: 'Diwali' } as never], products: [compactCard(card, [0], prefix)] }).products[0]!
    // The cover, the second, each colour's first, and the photo Rani's swatch is cut from (e) — not c.
    expect(out.images.map((i) => i.id)).toEqual(['a', 'b', 'd', 'e'])
    expect(out.images).toEqual(card.images.filter((i) => ['a', 'b', 'd', 'e'].includes(i.id)))
    expect(out.variants).toEqual([{ ...card.variants[0], sku: null }])
    expect(out.colours).toEqual(card.colours)
    expect(out.offers).toEqual([{ label: 'Diwali' }])
    expect(out.attributes).toEqual(card.attributes)
  })
  it('keeps a photo outside the shared folder, and odd widths, whole', () => {
    const odd = { ...card, images: [img('x', { base: 'https://elsewhere.example/x', widths: [400] })] }
    const out = expand({ photoPrefix: photoPrefixOf([base('a')]), collections: [], offers: [], products: [compactCard(odd, [], photoPrefixOf([base('a')]))] }).products[0]!
    expect(out.images[0]).toMatchObject({ base: 'https://elsewhere.example/x', widths: [400] })
  })
})
