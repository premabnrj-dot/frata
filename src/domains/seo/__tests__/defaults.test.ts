import { describe, expect, it } from 'vitest'
import { defaultDescription, defaultTitle, handleChange, productJsonLd, shareCard, variantUrl } from '../defaults'

describe('seo defaults', () => {
  it('title: colour only when there is one; shop once at the end', () => {
    expect(defaultTitle('Linen Kurta', ['Indigo'], 'Kesar Studio')).toBe('Linen Kurta – Indigo | Kesar Studio')
    expect(defaultTitle('Linen Kurta', ['Indigo', 'Rust'], 'Kesar Studio')).toBe('Linen Kurta | Kesar Studio')
  })
  it('description from the product’s own facts', () => {
    expect(defaultDescription({ title: 'Chanderi Kurta', fabric: 'Chanderi', minPrice: 249000, codOn: true, returnDays: 7, returnKind: 'exchange_or_refund', city: 'Indore' }))
      .toBe('Chanderi Kurta in chanderi. From ₹2,490, Pay on delivery, 7-day exchange. Ships from Indore.')
  })
  it('share card cuts at a word under 80', () => {
    const d = shareCard('X', 'a'.repeat(30) + ' ' + 'b'.repeat(30) + ' ' + 'c'.repeat(30)).description
    expect(d.length).toBeLessThanOrEqual(80); expect(d.endsWith('…')).toBe(true)
  })
  it('an old address is kept only once the product has been live', () => {
    expect(handleChange('a', 'b', true)).toEqual({ changed: true, keepOld: true })
    expect(handleChange('a', 'b', false)).toEqual({ changed: true, keepOld: false })
  })
  it('variant URL and ProductGroup', () => {
    expect(variantUrl('https://k.frata.store/products/kurta', ['Size', 'Colour'], ['M', 'Indigo Ikat'])).toBe('https://k.frata.store/products/kurta?size=m&colour=indigo-ikat')
    const ld = productJsonLd({ name: 'Kurta', description: 'd', url: 'https://k/p', groupId: 'g', brand: 'Kesar', options: ['Size', 'Colour'], images: ['i'], material: null, gender: 'female',
      variants: [{ sku: 'A', gtin: '4006381333931', values: ['M', 'Indigo'], price: 249050, image: null, availability: { kind: 'in_stock', canBuy: true, label: '', google: 'in_stock' } },
        { sku: 'B', values: ['L', 'Indigo'], price: 249000, image: null, availability: { kind: 'preorder', canBuy: true, label: '', shipsBy: '2026-12-12', google: 'preorder', availabilityDate: '2026-12-12T00:00:00+05:30' } }] }) as Record<string, any>
    expect(ld['@type']).toBe('ProductGroup'); expect(ld.variesBy).toEqual(['https://schema.org/size', 'https://schema.org/color'])
    expect(ld.hasVariant[0].offers).toMatchObject({ price: '2490.5', priceCurrency: 'INR', availability: 'https://schema.org/InStock' })
    expect(ld.hasVariant[1].offers.availability).toBe('https://schema.org/PreOrder'); expect(ld.hasVariant[1].color).toBe('Indigo')
    expect(ld.hasVariant[0]).toMatchObject({ sku: 'A', mpn: 'A', gtin: '4006381333931' }); expect(ld.hasVariant[1].gtin).toBeUndefined()
  })
})

describe('page descriptions (S2·1)', () => {
  it('cut at a word under 155; defaults from the shop', async () => {
    const { trimmed, pageDescription } = await import('../defaults')
    const long = 'word '.repeat(60)
    expect(trimmed(long).length).toBeLessThanOrEqual(155)
    expect(trimmed(long).endsWith('…')).toBe(true)
    expect(pageDescription.collection('Festive edit', '', 'Kesar Studio')).toBe('Festive edit from Kesar Studio.')
    expect(pageDescription.list('Kesar Studio', true)).toBe('Shop all of Kesar Studio: pay on delivery.')
  })
  it('collection (S2·2): own title and description win; else name and intro', async () => {
    const { collectionSeo } = await import('../defaults')
    const c = { title: 'Festive edit', description: 'Silk for Diwali.', seoTitle: '', seoDescription: '' }
    expect(collectionSeo(c, 'Kesar Studio')).toEqual({ title: 'Festive edit | Kesar Studio', description: 'Silk for Diwali.' })
    expect(collectionSeo({ ...c, seoTitle: ' Diwali silk sarees ', seoDescription: 'Hand-woven.' }, 'Kesar Studio')).toEqual({ title: 'Diwali silk sarees', description: 'Hand-woven.' })
  })
})
