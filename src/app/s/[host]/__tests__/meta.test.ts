import { describe, expect, it } from 'vitest'
import type { StoreShop } from '@/lib/queries/storefront'
import { shopTags, toMetadata } from '../_meta'

const shop = { host: 'kesar-studio.frrata.shop', shopName: 'Kesar Studio', shopLanguage: 'en', publishedAt: '2026-11-06T00:00:00Z' } as unknown as StoreShop
const page = { path: '/policies/returns', title: 'Returns | Kesar Studio', shareTitle: 'Returns', description: null, image: null }

describe('shop page metadata (S1·1)', () => {
  it('a published, indexable page: index, follow, large previews', () => {
    expect(toMetadata(shopTags(shop, page)).robots).toEqual({ index: true, follow: true, 'max-image-preview': 'large' })
  })
  it('an unpublished shop or an unlisted product: noindex, nofollow, no preview hint', () => {
    expect(toMetadata(shopTags({ ...shop, publishedAt: null } as StoreShop, page)).robots).toEqual({ index: false, follow: false })
    expect(toMetadata(shopTags(shop, { ...page, indexable: false })).robots).toEqual({ index: false, follow: false })
  })
  it('no description: null, so Frrata\'s own never reaches a shop\'s card', () => {
    const m = toMetadata(shopTags(shop, page))
    expect(m.description).toBeNull()
    expect((m.openGraph as { description?: string }).description).toBeUndefined()
  })
})
