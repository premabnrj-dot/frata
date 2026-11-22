import 'server-only'
import type { ListQuery } from '@/domains/catalogue/list-query'
import { withActor, type BuilderActor } from '@/lib/db/actor'
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
