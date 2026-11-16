import { describe, expect, it, vi } from 'vitest'
import type { ResolvedTheme } from '@/domains/themes/types'
import type { StoreShop } from '@/lib/queries/storefront'
import type { ShopBrand } from '@/lib/queries/brand'

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<typeof import('@/lib/env')>()), BLOB_STORE_ID: 'store_icontest' }))

const T = '11111111-1111-1111-1111-111111111111'
const MEDIA = 'https://icontest.public.blob.vercel-storage.com'
const shop = { id: T, shopName: 'House of Ayuda', logoUrl: null } as unknown as StoreShop
const theme = { schemes: { tint: { bg: '#F3E7D7', text: '#1C1917' } } } as unknown as ResolvedTheme
const palette = { bg: '#FBF7F1', panel: '#F2EADF', text: '#221A14', muted: '#665A4E', accent: '#8C1D2C', on: '#FBF7F1', edge: '#9A8B7A', line: '#DDD0BE', good: '#2F6B3B', warn: '#8A5300', bad: '#A3261B' } as const
const brand = (main: string | null): ShopBrand => ({ saved: true, seasons: [], record: { logos: { main, mark: null, stacked: null, reversed: null }, palette, display: 'tiro', body: 'mukta', radius: 4, density: 'standard' } })

describe('a store’s icon (one-address P1·5)', () => {
  it('a theme shop: its logo or initial on the look’s tint, as before', async () => {
    const { iconContent } = await import('../icon')
    expect(iconContent(shop, theme)).toEqual({ logo: null, initial: 'H', bg: '#F3E7D7', fg: '#1C1917' })
    expect(iconContent(shop, theme, null)).toEqual(iconContent(shop, theme))
  })
  it('a code-site store: no logo, the initial on the accent', async () => {
    const { iconContent } = await import('../icon')
    expect(iconContent(shop, theme, brand(null))).toEqual({ logo: null, initial: 'H', bg: '#8C1D2C', fg: '#FBF7F1' })
  })
  it('a raster logo as it is, an SVG one as its PNG rendition, on the record’s background', async () => {
    const { iconContent } = await import('../icon')
    const webp = `${MEDIA}/tenants/${T}/brand/22222222-2222-2222-2222-222222222222-400.webp`
    expect(iconContent(shop, theme, brand(webp))).toEqual({ logo: webp, initial: 'H', bg: '#FBF7F1', fg: '#221A14' })
    const svg = iconContent(shop, theme, brand(`${MEDIA}/tenants/${T}/brand/${'a'.repeat(64)}.svg`))
    expect(svg.logo).toMatch(new RegExp(`^${MEDIA}/tenants/${T}/documents/[0-9a-f]{64}\\.png$`))
  })
})
