import 'server-only'
import * as S from '@/domains/storefront-api/2026-12/schemas'
import { collectionOut, collectionPageOut, MAX_PAGE, offersOut, pageOut, productOut, searchOut, shopOut } from '@/domains/storefront-api/2026-12/map'
import { apiAnnouncement, apiCatalogue, apiProduct, apiShop, previewCatalogue, previewProduct, previewShop, shopAnnouncement, type Lookup } from '@/lib/queries/storefront'
import type { ApiCtx } from './request'
import { visibility, type Status } from '@/domains/catalogue/availability'
import { storeHost } from '@/domains/media/sizes'
import { BLOB_STORE_ID } from '@/lib/env'
import { contentOut, faqOut, storePageOut } from '@/domains/storefront-api/2026-12/content-map'
import { resolvePage } from '@/domains/pages/page'
import { HANDLE as PAGE_HANDLE } from '@/domains/pages/templates'
import { apiContent, previewContent } from '@/lib/queries/content'
import { previewPages, shopPages, type ShopPage } from '@/lib/queries/pages'
import { previewEntry } from '@/domains/storefront-api/preview'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'

// =============================================================================
// FILE: src/lib/storefront-api/resources.ts — VERSION 2026-12's RESOURCES (spec § 3; V1 plan § SA1·3).
//
// One function per resource, shared by the cached tree (live keys: the shop's cached loaders) and the dynamic tree (test
// keys: the uncached preview loaders: a draft product opens by its handle, never a draft page or FAQ; lists, collections and search stay listed-only; the
// offer bar is the shop's own live one under either key: a draft offer never shows). Every read takes the shop from ctx.tenantId, never anything
// else, and never opens a withTenant around a cached loader (P4). The answer is a mapper's output; apiRequest parses it.
// =============================================================================

const loaders = (ctx: ApiCtx) => ctx.keyKind === 'test'
  ? { shop: previewShop, catalogue: previewCatalogue, product: previewProduct, content: previewContent }
  : { shop: apiShop, catalogue: apiCatalogue, product: apiProduct, content: apiContent }

/** One page by its address: a live page only, under either key. A draft page or FAQ needs ADR-0018 § 12's signed
 *  preview token (tenant, key id, entry, ≤ 10 minutes), which SA1b builds; until then a test key reads what is live
 *  (owner, 2026-11-15: ship with drafts closed to test keys). */
async function pageAt(ctx: ApiCtx, handle: string): Promise<Pick<ShopPage, 'handle' | 'title' | 'template' | 'fill'> | null> {
  if (!PAGE_HANDLE.test(handle)) return null
  return (await shopPages(ctx.tenantId)).find((p) => p.handle === handle) ?? null
}
/** A page as the store shows a shopper (never a sample or an example), bound answers from the store's Settings. */
async function pageNodes(ctx: ApiCtx, p: Pick<ShopPage, 'template' | 'fill'>) {
  const s = await loaders(ctx).shop(ctx.tenantId)
  return s ? resolvePage(p.template, p.fill, 'shop', { facts: s, overrides: s.overrides, inr: (n) => formatInr(paise(n)) }) : null
}

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
    // The site origin from the shop entry itself, read once, so this answer and the shop's move never disagree (SA1b).
    const s = await loaders(ctx).shop(ctx.tenantId)
    if (!s) return null
    return shopOut(mapCtx(ctx), s, { site: s.siteOrigin, checkout: `https://${s.host}` }, ctx.now)
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
  content: { schema: S.Content, run: async (ctx: ApiCtx) => {
    const [c, pages] = await Promise.all([loaders(ctx).content(ctx.tenantId), shopPages(ctx.tenantId)])
    return contentOut(c, pages, ctx.now)
  } },
  page: { schema: S.StorePage, run: async (ctx: ApiCtx, p: { handle: string }) => {
    const page = await pageAt(ctx, p.handle)
    const nodes = page && await pageNodes(ctx, page)
    return page && nodes ? storePageOut(mapCtx(ctx), page, nodes) : null
  } },
  faq: { schema: S.Faq, run: async (ctx: ApiCtx) => {
    // The live FAQ under either key, as pages/{handle}: its draft waits for the signed preview token (ADR-0018 § 12).
    const page = (await shopPages(ctx.tenantId)).find((x) => x.template === 'faq')
    const nodes = page && await pageNodes(ctx, page)
    return page && nodes ? faqOut(page, nodes) : null
  } },
  // ADR-0018 § 12 (SA1b D·4): a page or the FAQ as it stands now, hidden or unpublished, under a token apiRequest has
  // already checked for this store, key and entry. Read after previewPages' own transaction (P4).
  previewPage: { schema: S.StorePage, entry: (p: { handle: string }) => previewEntry('page', p.handle), run: async (ctx: ApiCtx, p: { handle: string }) => {
    if (!PAGE_HANDLE.test(p.handle)) return null
    const page = (await previewPages(ctx.tenantId)).find((x) => x.handle === p.handle && x.template !== 'faq')
    const nodes = page && await pageNodes(ctx, page)
    return page && nodes ? storePageOut(mapCtx(ctx), page, nodes) : null
  } },
  previewFaq: { schema: S.Faq, entry: () => previewEntry('faq'), run: async (ctx: ApiCtx) => {
    const page = (await previewPages(ctx.tenantId)).find((x) => x.template === 'faq')
    const nodes = page && await pageNodes(ctx, page)
    return page && nodes ? faqOut(page, nodes) : null
  } },
  search: { schema: S.Search, run: async (ctx: ApiCtx, p: { q: string }) =>
    searchOut(mapCtx(ctx), (await loaders(ctx).catalogue(ctx.tenantId)).products, p.q, ctx.now) },
} as const
