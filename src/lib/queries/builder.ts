import 'server-only'
import type { ListQuery } from '@/domains/catalogue/list-query'
import { withActor, type BuilderActor } from '@/lib/db/actor'
import { listCollectionsWith, listProductsWith } from './catalogue'

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
