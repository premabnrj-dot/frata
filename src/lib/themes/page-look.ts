import 'server-only'
import type { Circle, StripPiece } from '@/components/storefront/shell'
import { inCollection } from '@/domains/storefront/listing'
import { sourceProducts } from '@/domains/storefront/sources'
import { resolveStored } from '@/domains/themes/resolve'
import { VIDEO_KEYS } from '@/domains/themes/sections'
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

/** Whether this look's header or footer draws from the catalogue (circles, the shop panel, the Instagram strip). */
export const shellNeedsCatalogue = (t: ResolvedTheme) => t.settings.header === 'circles' || t.settings.header === 'panel' || t.settings.footer === 'gram'
/** The header's pictures (circles, or the shop panel) and the footer's strip, from one catalogue read. */
export function shellPictures(t: ResolvedTheme, cat: StoreCatalogue | null, now: Date): { circles: Circle[]; strip: StripPiece[] } {
  if (!cat) return { circles: [], strip: [] }
  const circles = t.settings.header === 'circles' || t.settings.header === 'panel' ? circlesOf(cat, now) : []
  const strip = t.settings.footer === 'gram' ? stripOf(cat, now) : []
  return { circles, strip }
}
/** The Instagram strip: the newest six listed pieces that have a photo. */
export function stripOf(cat: StoreCatalogue, now: Date): StripPiece[] {
  return sourceProducts({ kind: 'newest' }, cat, now, []).filter((p) => p.images[0]).slice(0, 6).map((p) => ({ handle: p.handle, title: p.title, image: p.images[0]! }))
}

/** The Best sellers windows this Home uses (read only those; each read is cached an hour). */
export const bestSellerWindows = (t: ResolvedTheme): (30 | 90)[] =>
  [...new Set(t.home.flatMap((s) => (s.key === 'products' && s.source.kind === 'best_sellers' && !s.hidden ? [s.source.days] : [])))]

export async function bestSellersFor(t: ResolvedTheme, read: (days: number) => Promise<string[]>): Promise<Partial<Record<30 | 90, string[]>>> {
  const ws = bestSellerWindows(t)
  return Object.fromEntries(await Promise.all(ws.map(async (d) => [d, await read(d)] as const)))
}

export type LookVideos = Record<string, { playbackId: string; width: number | null; height: number | null }>
/** V1: the videos this Home's sections name (only where the theme offers video: resolveTheme dropped the rest). */
export async function videosFor(t: ResolvedTheme, read: (key: string) => Promise<LookVideos>): Promise<LookVideos> {
  const ids = [...new Set(t.home.flatMap((s) => ((VIDEO_KEYS as readonly string[]).includes(s.key) && 'video' in s && s.video && !s.hidden ? [s.video.id] : [])))].sort()
  return ids.length ? read(ids.join(',')) : {}
}
