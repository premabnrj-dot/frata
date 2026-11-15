import 'server-only'
import * as S from '@/domains/storefront-api/2026-12/schemas'
import { collectionOut, collectionPageOut, MAX_PAGE, offersOut, pageOut, productOut, searchOut, shopOut } from '@/domains/storefront-api/2026-12/map'
import { apiAnnouncement, apiCatalogue, apiProduct, apiShop, previewCatalogue, previewProduct, previewShop, shopAnnouncement, type Lookup } from '@/lib/queries/storefront'
import { siteOriginFor } from '@/lib/queries/storefront-api'
import type { ApiCtx } from './request'
import { visibility, type Status } from '@/domains/catalogue/availability'
import { storeHost } from '@/domains/media/sizes'
import { BLOB_STORE_ID } from '@/lib/env'

// =============================================================================
// FILE: src/lib/storefront-api/resources.ts — VERSION 2026-12's RESOURCES (spec § 3; V1 plan § SA1·3).
//
// One function per resource, shared by the cached tree (live keys: the shop's cached loaders) and the dynamic tree (test
// keys: the uncached preview loaders: a draft opens by its handle; lists, collections and search stay listed-only; the
// offer bar is the shop's own live one under either key: a draft offer never shows). Every read takes the shop from ctx.tenantId, never anything
// else, and never opens a withTenant around a cached loader (P4). The answer is a mapper's output; apiRequest parses it.
// =============================================================================

const loaders = (ctx: ApiCtx) => ctx.keyKind === 'test'
  ? { shop: previewShop, catalogue: previewCatalogue, product: previewProduct }
  : { shop: apiShop, catalogue: apiCatalogue, product: apiProduct }

/** The mappers' context: the shop from the key, and Frrata's one media store (photos from anywhere else are dropped). */
const mapCtx = (ctx: ApiCtx) => ({ tenantId: ctx.tenantId, mediaHost: storeHost(BLOB_STORE_ID) })

const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** A page number 1–MAX_PAGE from the path, or null (a 404 before any read). */
export const pageParam = (raw: Record<string, string | string[] | undefined>) => {
  const n = typeof raw.n === 'string' && /^[1-9]\d?$/.test(raw.n) ? Number(raw.n) : null
  return n === null || n > MAX_PAGE ? null : { page: n }
}
export const handleParam = (raw: Record<string, string | string[] | undefined>) =>
  typeof raw.handle === 'string' && raw.handle.length <= 100 && HANDLE.test(raw.handle) ? { handle: raw.handle } : null
export const handlePageParam = (raw: Record<string, string | string[] | undefined>) => {
  const h = handleParam(raw), p = pageParam(raw)
  return h && p ? { ...h, ...p } : null
}
export const searchParam = (_raw: unknown, search: URLSearchParams | null) => {
  const q = (search?.get('q') ?? '').trim().replace(/\s+/g, ' ')
  return q.length >= 1 && q.length <= 60 ? { q } : null
}

export const RESOURCES = {
  shop: { schema: S.Shop, run: async (ctx: ApiCtx) => {
    const [s, site] = await Promise.all([loaders(ctx).shop(ctx.tenantId), siteOriginFor(ctx.tenantId)])
    if (!s) return null
    return shopOut(mapCtx(ctx), s, { site, checkout: `https://${s.host}` }, ctx.now)
  } },
  products: { schema: S.Page, run: async (ctx: ApiCtx, p: { page: number }) =>
    pageOut(mapCtx(ctx), (await loaders(ctx).catalogue(ctx.tenantId)).products, p.page, ctx.now) },
  product: { schema: S.Product, run: async (ctx: ApiCtx, p: { handle: string }) => {
    const read = loaders(ctx).product
    let found: Lookup = await read(ctx.tenantId, p.handle)
    // A moved product answers with its current handle (spec § 3, architecture 8): one more read, never a redirect.
    if (found.kind === 'moved' && HANDLE.test(found.to)) found = await read(ctx.tenantId, found.to)
    if (found.kind !== 'current') return null
    const out = productOut(mapCtx(ctx), found.product, ctx.now)
    // Under a live key, only what the shop's own product page would open now (its rule, not a copy): no draft, and no
    // scheduled product before its moment (security of the drop; impact review 2026-11-15 BLOCKER).
    const got = found.product
    return ctx.keyKind === 'public' && !visibility(got.status as Status, got.publishAt ? new Date(got.publishAt) : null, ctx.now).reachable ? null : out
  } },
  collections: { schema: S.Collections, run: async (ctx: ApiCtx) =>
    ({ collections: (await loaders(ctx).catalogue(ctx.tenantId)).collections.slice(0, 500).map(collectionOut) }) },
  collection: { schema: S.CollectionPage, run: async (ctx: ApiCtx, p: { handle: string; page: number }) => {
    const cat = await loaders(ctx).catalogue(ctx.tenantId)
    const c = cat.collections.find((x) => x.handle === p.handle) ?? cat.collections.find((x) => x.handle === cat.movedCollections?.[p.handle])
    return c ? collectionPageOut(mapCtx(ctx), c, cat.products, p.page, ctx.now) : null
  } },
  offers: { schema: S.Offers, run: async (ctx: ApiCtx) => offersOut(await (ctx.keyKind === 'test' ? shopAnnouncement : apiAnnouncement)(ctx.tenantId), ctx.now) },
  search: { schema: S.Search, run: async (ctx: ApiCtx, p: { q: string }) =>
    searchOut(mapCtx(ctx), (await loaders(ctx).catalogue(ctx.tenantId)).products, p.q, ctx.now) },
} as const
