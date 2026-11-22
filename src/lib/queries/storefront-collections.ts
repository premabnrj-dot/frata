import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { collectionProducts, collections } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import type { ListCollection } from '@/domains/storefront/listing'
import { shopCached } from './storefront'

// =============================================================================
// FILE: src/lib/queries/storefront-collections.ts — A STORE'S COLLECTIONS ALONE, for the Storefront API's live product
// copies (G·4, G6: a product's home collection; speed review 2026-11-22 MED-2: the live product route read the whole
// catalogue entry, 0.88–1.24 MB, to find it). Two statements, in the store's order (by title, as the catalogue entry),
// the API's hour and the catalogue's tags, so every catalogue purge reaches it as it reaches the entry.
// =============================================================================

export type StoreCollectionRef = ListCollection & { id: string; handle: string; title: string; description: string }

/** Uncached (the int test's size and parity check); pages read apiCollections. */
export async function coreCollections(tenantId: string): Promise<StoreCollectionRef[]> {
  return withTenant(tenantId, async (tx) => {
    const [colls, members] = await Promise.all([
      tx.select({ id: collections.id, handle: collections.handle, title: collections.title, kind: collections.kind, matchAll: collections.matchAll, rules: collections.rules, sort: collections.sort })
        .from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)),
      tx.select({ collectionId: collectionProducts.collectionId, productId: collectionProducts.productId })
        .from(collectionProducts).where(eq(collectionProducts.tenantId, tenantId)).orderBy(asc(collectionProducts.position)),
    ])
    return colls.map((c) => ({ ...c, description: '', kind: c.kind as 'manual' | 'auto', matchAll: c.matchAll === 1, rules: c.rules, productIds: members.filter((m) => m.collectionId === c.id).map((m) => m.productId) }))
  })
}

export const apiCollections = shopCached('api-collections-v1', 'catalogue', (t) => coreCollections(t), 3600)
