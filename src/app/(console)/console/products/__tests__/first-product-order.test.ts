import { describe, expect, it, vi } from 'vitest'

// addFirstProduct reads the photos' first bytes (network) BEFORE its transaction opens, never inside it (plan
// 2026-11-23-o2a-setup-card O2a·6; attachPhotos does the same): the photo check is awaited and settled before asMember
// is entered, and a refused photo never opens one.
const calls = vi.hoisted(() => [] as string[])
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/queries/storefront', () => ({ refreshShop: () => {} }))
vi.mock('@/lib/queries/catalogue', () => ({ firstProductFormFor: async () => ({ sells: [], defaultHsn: '', types: [] }) }))
vi.mock('@/lib/media/uploaded', () => ({
  photosAreMade: async (photos: unknown[]) => { calls.push('photos:start'); await new Promise((r) => setTimeout(r, 5)); calls.push('photos:done'); return photos.length < 2 },
}))
vi.mock('@/lib/auth/as-member', () => ({ asMember: async () => { calls.push('asMember'); return { ok: false, error: 'stop here' } } }))

describe('addFirstProduct: photos are checked before the transaction', () => {
  const input = (n: number) => ({ title: 'Ivory kurta set', price: '2490', stock: '5', sizes: ['S'], photos: Array.from({ length: n }, () => ({ base: 'https://x/p', widths: [400], width: 900, height: 1125 })) })
  it('awaits the photo check, then enters asMember', async () => {
    const { addFirstProduct } = await import('../first-product-actions')
    calls.length = 0
    expect(await addFirstProduct(input(1), true)).toEqual({ ok: false, error: 'stop here' })
    expect(calls).toEqual(['photos:start', 'photos:done', 'asMember'])
  })
  it('a refused photo never opens a transaction', async () => {
    const { addFirstProduct } = await import('../first-product-actions')
    calls.length = 0
    expect(await addFirstProduct(input(2), true)).toMatchObject({ ok: false, error: 'That file is not a photo we made. Upload it again.' })
    expect(calls).toEqual(['photos:start', 'photos:done'])
  })
})
