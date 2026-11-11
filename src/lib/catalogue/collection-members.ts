import 'server-only'
import { eq } from 'drizzle-orm'
import { cleanRules, matches } from '@/domains/catalogue/collection-rules'
import type { Tx } from '@/lib/db'
import { collectionProducts, collections } from '@/lib/db/schema-catalogue'
import { productFactsIn } from '@/lib/queries/catalogue'

// Which products each collection holds now (offers O·2), in the caller's transaction; storefront.ts caches it per shop.

/** collectionMembers, in the caller's tenant transaction: placement prices with members read now, under its locks. */
export async function collectionMembersIn(tx: Tx, tenantId: string): Promise<Record<string, string[]>> {
  const cols = await tx.select({ id: collections.id, kind: collections.kind, matchAll: collections.matchAll, rules: collections.rules }).from(collections).where(eq(collections.tenantId, tenantId))
  const picked = await tx.select({ collectionId: collectionProducts.collectionId, productId: collectionProducts.productId }).from(collectionProducts).where(eq(collectionProducts.tenantId, tenantId))
  const auto = cols.filter((c) => c.kind === 'auto')
  const facts = auto.length ? await productFactsIn(tx, tenantId) : []
  return Object.fromEntries(cols.map((c) => [c.id, c.kind === 'auto'
    ? facts.filter((f) => matches(cleanRules(c.rules), c.matchAll === 1, f)).map((f) => f.id)
    : picked.filter((p) => p.collectionId === c.id).map((p) => p.productId)]))
}
