import 'server-only'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { productPairs, products } from '@/lib/db/schema-catalogue'
import { acceptedBase, WIDTHS } from '@/domains/media/sizes'
import { MAX_PAIRS, type Story } from '@/domains/catalogue/stories'
export { cleanPairIds } from '@/domains/catalogue/stories'

// =============================================================================
// FILE: src/lib/catalogue/extras.ts — the server's half of a product's stories and pairings (Signal S3): a story
// photo must be this shop's own (its products folder, rebuilt by acceptedBase, sizes we make); a paired piece must be
// one of this shop's products (selected with an explicit tenant, every id found) — the composite FKs refuse the rest
// at the database too (tenancy review 2026-11-09). Called inside saveProduct's transaction, after its version check.
// =============================================================================

/** Story photos rebuilt for THIS shop; null when one isn't (the save then refuses with one message). */
export function checkStoryPhotos(stories: Story[], tenantId: string, host: string | null): Story[] | null {
  const out: Story[] = []
  for (const s of stories) {
    if (!s.image) { out.push(s); continue }
    const base = host ? acceptedBase(s.image.base, host, tenantId, 'products') : null
    if (!base || s.image.widths.some((w) => !(WIDTHS as readonly number[]).includes(w))) return null
    out.push({ ...s, image: { ...s.image, base } })
  }
  return out
}

/** Replace the product's pairings; false when an id isn't one of this shop's products (one message for "not yours"
 *  and "doesn't exist": it says nothing about another shop). */
export async function savePairs(tx: Tx, tenantId: string, productId: string, ids: string[]): Promise<boolean> {
  const wanted = ids.slice(0, MAX_PAIRS)
  if (wanted.length) {
    const found = await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, wanted)))
    if (found.length !== wanted.length || wanted.includes(productId.toLowerCase())) return false
  }
  await tx.delete(productPairs).where(and(eq(productPairs.tenantId, tenantId), eq(productPairs.productId, productId)))
  if (wanted.length) await tx.insert(productPairs).values(wanted.map((pairedId, position) => ({ tenantId, productId, pairedId, position })))
  return true
}

/** The product's pairings in order (the editor's card). */
export async function pairIdsOf(tx: Tx, tenantId: string, productId: string): Promise<string[]> {
  const rows = await tx.select({ id: productPairs.pairedId }).from(productPairs)
    .where(and(eq(productPairs.tenantId, tenantId), eq(productPairs.productId, productId))).orderBy(asc(productPairs.position))
  return rows.map((r) => r.id)
}
