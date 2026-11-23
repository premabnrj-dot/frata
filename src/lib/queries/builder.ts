import 'server-only'
import type { ListQuery } from '@/domains/catalogue/list-query'
import { assertCan, withActor, type BuilderActor } from '@/lib/db/actor'
import { listCollectionsWith, listProductsWith } from './catalogue'
import { builderBrandWith, builderCheckoutWith } from './brand'
import { urlFor } from '@/domains/media/sizes'

// =============================================================================
// FILE: src/lib/queries/builder.ts — what a partner's Builder reads (T1c, ADR-0015): the catalogue, as frata_builder,
// through the owner list's own SQL (never a copy). Each function takes the Builder's Actor, never a shop id, and
// asserts its capability through withActor. The only queries module a Builder page may import (check:capabilities).
// =============================================================================

/** Products, as the owner's list shows them (tabs, search, sort, 50 a page), read-only. */
export function builderProducts(actor: BuilderActor, query: ListQuery) {
  return withActor(actor, 'catalogue.read', (tx, tenantId) => listProductsWith(tx, tenantId, query))
}

/** Collections, each with how many products are in it now. */
export function builderCollections(actor: BuilderActor) {
  return withActor(actor, 'catalogue.read', (tx, tenantId) => listCollectionsWith(tx, tenantId))
}

/** Console › Brand, preview only (one-address P1·8, O9): the live record's named columns, as the Builder's grant allows. */
export function builderBrand(actor: BuilderActor) {
  return withActor(actor, 'preview.read', (tx, tenantId) => builderBrandWith(tx, tenantId))
}

/** The preview's sample product for a Builder (mockup screen 6): the first active, priced product, through the owner list's
 *  own SQL as frata_builder (a Builder already reads Products). Null when the store has none. */
export async function builderBrandSample(actor: BuilderActor) {
  const list = await withActor(actor, 'catalogue.read', (tx, tenantId) => listProductsWith(tx, tenantId, { filter: 'active', sort: 'edited', q: '', page: 1 }))
  const p = list.rows.find((r) => r.minPrice !== null && r.cover) ?? list.rows.find((r) => r.minPrice !== null)
  return p ? { title: p.title, price: p.minPrice!, mrp: null, photo: p.cover ? urlFor(p.cover.base, 400) : null } : null
}

/** Console › Brand › Checkout, preview only (one-address P2·6, O9): the live record and design, and the store's public
 *  delivery, returns and Pay on delivery facts the trust blocks name, as the Builder's grant allows (drizzle/0161). */
export function builderCheckout(actor: BuilderActor) {
  return withActor(actor, 'preview.read', async (tx, tenantId) => {
    const [record, c] = await Promise.all([builderBrandWith(tx, tenantId), builderCheckoutWith(tx, tenantId)])
    return { record, ...c }
  })
}

/** Studio's `store_facts` tool (plan docs/plans/2026-11-22-v3a-runtime.md R5): what the store's public pages already
 *  show, as frata_builder whatever the person's role, in one transaction: the live brand, the first 20 active products
 *  (title, handle, type, price range in paise, variant count) and the collections. Never stock, a cost, an order or a
 *  person (ADR-0020 § 6). */
export function builderStoreFacts(actor: BuilderActor) {
  // It reads the brand too (builderBrand's grant), so it needs both capabilities; withActor asserts the second.
  assertCan(actor, 'preview.read')
  return withActor(actor, 'catalogue.read', async (tx, tenantId) => {
    const [brand, list, cols] = await Promise.all([
      builderBrandWith(tx, tenantId),
      listProductsWith(tx, tenantId, { filter: 'active', sort: 'edited', q: '', page: 1 }),
      listCollectionsWith(tx, tenantId),
    ])
    return {
      brand: { palette: brand.palette, display: brand.display, body: brand.body, radius: brand.radius, density: brand.density, hasLogo: brand.logos.main !== null },
      products: { active: list.counts.active, first: list.rows.slice(0, 20).map((r) => ({ title: r.title, handle: r.handle, type: r.typeName ?? null, minPrice: r.minPrice, maxPrice: r.maxPrice, variants: r.variantCount })) },
      collections: cols.slice(0, 50).map((c) => ({ title: c.title, handle: c.handle, products: c.count })),
    }
  })
}
