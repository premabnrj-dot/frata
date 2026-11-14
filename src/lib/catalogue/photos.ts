import { colourIndex } from '@/domains/catalogue/option-kind'
import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { acceptedBase, storeHost, WIDTHS } from '@/domains/media/sizes'
import type { Tx } from '@/lib/db'
import { productImages, products } from '@/lib/db/schema-catalogue'
import { BLOB_STORE_ID } from '@/lib/env'

// =============================================================================
// FILE: src/lib/catalogue/photos.ts
//
// ADDING PHOTOS TO A PRODUCT, for the editor (attachPhotos) and the Photos page (addPhotos), in the caller's tenant
// transaction. Rules:
// - The stored URL is the one acceptedBase REBUILDS for this shop's products folder, never the browser's string.
// - Only the ladder's widths; a size in pixels.
// - The product is this shop's (tenant where; the policy is the lock), locked while its photos are counted and placed —
//   FOR NO KEY UPDATE, so rows that only point at it (a review, an order line) are never held up.
// - A photo whose base the product has already is skipped, not added twice: an attach that saved but whose answer was
//   lost is sent again as it was (the Photos page's Try again).
// - `max`: the photos it may hold, counting the ones it has (the Photos page: MAX_PHOTOS_PER_PRODUCT). A photo past it
//   refuses the whole call.
// - A colour is kept only when it is one of the product's colour option's values (written as the product writes it).
// - New photos go after the ones it has, in the order given.
// =============================================================================

export type NewPhoto = { base: string; widths: number[]; width: number; height: number; colour?: string | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function attachIn(tx: Tx, tenantId: string, productId: string, photos: readonly NewPhoto[], opts: { max?: number } = {}): Promise<{ ok: true; added: number; live: boolean } | { ok: false; error: string }> {
  const host = storeHost(BLOB_STORE_ID)
  if (!host) return { ok: false, error: 'Photo storage is not connected.' }
  if (typeof productId !== 'string' || !UUID.test(productId)) return { ok: false, error: 'This product is not in your shop.' }
  const clean: (NewPhoto & { base: string })[] = []
  for (const ph of photos) {
    const base = acceptedBase(String(ph?.base ?? ''), host, tenantId, 'products')
    if (!base) return { ok: false, error: 'That photo is not in your shop’s folder.' }
    const widths = Array.isArray(ph.widths) ? ph.widths : []
    if (!widths.length || widths.length > WIDTHS.length || widths.some((w) => !(WIDTHS as readonly number[]).includes(w)) || !(Number(ph.width) > 0 && Number(ph.height) > 0)) {
      return { ok: false, error: 'That photo’s sizes are not ones we make.' }
    }
    clean.push({ ...ph, base, widths: [...new Set(widths)].sort((a, b) => a - b) })
  }
  const [p] = await tx.select({ id: products.id, status: products.status, options: products.options, optionValues: products.optionValues }).from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.id, productId))).for('no key update')
  if (!p) return { ok: false, error: 'This product is not in your shop.' }
  const there = new Set((await tx.select({ base: productImages.base }).from(productImages)
    .where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId), inArray(productImages.base, clean.map((ph) => ph.base))))).map((r) => r.base))
  const fresh: typeof clean = []
  for (const ph of clean) if (!there.has(ph.base)) { there.add(ph.base); fresh.push(ph) }
  if (!fresh.length) return { ok: true, added: 0, live: p.status === 'active' || p.status === 'unlisted' }
  const [have] = await tx.select({ n: sql<number>`count(*)::int`, last: sql<number>`coalesce(max(position), -1)::int` }).from(productImages)
    .where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId)))
  const n = have?.n ?? 0
  if (opts.max !== undefined && n + fresh.length > opts.max) {
    return { ok: false, error: n >= opts.max ? `This product has its ${opts.max} photos.` : `This product has room for ${opts.max - n} more ${opts.max - n === 1 ? 'photo' : 'photos'}.` }
  }
  const at = colourIndex(p.options)
  const colours = at >= 0 ? (p.optionValues[at] ?? []) : []
  const colourOf = (c: unknown) => (typeof c === 'string' ? colours.find((v) => v.toLowerCase() === c.trim().toLowerCase()) ?? null : null)
  const last = have?.last ?? -1
  await tx.insert(productImages).values(fresh.map((ph, i) => ({
    tenantId, productId, base: ph.base, widths: ph.widths, width: Math.round(ph.width), height: Math.round(ph.height), optionValue: colourOf(ph.colour), position: last + 1 + i,
  })))
  await tx.update(products).set({ updatedAt: new Date() }).where(and(eq(products.tenantId, tenantId), eq(products.id, productId)))
  return { ok: true, added: fresh.length, live: p.status === 'active' || p.status === 'unlisted' }
}
