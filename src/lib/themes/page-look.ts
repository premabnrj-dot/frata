import 'server-only'
import type { Circle } from '@/components/storefront/shell'
import { inCollection } from '@/domains/storefront/listing'
import { resolveStored } from '@/domains/themes/resolve'
import type { ResolvedTheme } from '@/domains/themes/types'
import type { StoreCatalogue, StoreShop, StoredLook } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/lib/themes/page-look.ts — what a shop page needs from its look, shared by the shop and the console's
// previews: the resolved theme, the header's category circles, and which Best sellers windows to read.
// =============================================================================

export const themeOf = (shop: StoreShop, look: StoredLook | null): ResolvedTheme => resolveStored(look, shop)

/** The circles row: collections with a listed product, each with its first product's first photo (≤ 8). */
export function circlesOf(cat: StoreCatalogue, now: Date): Circle[] {
  return cat.collections.flatMap((c) => {
    const first = inCollection(c, cat.products, now)[0]
    return first ? [{ handle: c.handle, title: c.title, image: first.images[0] ?? null }] : []
  }).slice(0, 8)
}

/** The Best sellers windows this Home uses (read only those; each read is cached an hour). */
export const bestSellerWindows = (t: ResolvedTheme): (30 | 90)[] =>
  [...new Set(t.home.flatMap((s) => (s.key === 'products' && s.source.kind === 'best_sellers' && !s.hidden ? [s.source.days] : [])))]

export async function bestSellersFor(t: ResolvedTheme, read: (days: number) => Promise<string[]>): Promise<Partial<Record<30 | 90, string[]>>> {
  const ws = bestSellerWindows(t)
  return Object.fromEntries(await Promise.all(ws.map(async (d) => [d, await read(d)] as const)))
}
