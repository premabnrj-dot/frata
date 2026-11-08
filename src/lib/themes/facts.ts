import 'server-only'
import { eq } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { shopSettings } from '@/lib/db/schema'
import { collectionProducts, collections } from '@/lib/db/schema-catalogue'
import type { ShopFacts } from '@/domains/themes/readiness'

/** The facts readiness needs (and the baseline look a shop had before themes), read in the shop's transaction. */
export async function lookFacts(tx: Tx, tenantId: string): Promise<ShopFacts & { accent: string; displayFont: string; sells: string[] }> {
  const [s] = await tx.select({ codOn: shopSettings.codOn, freeShippingAbove: shopSettings.freeShippingAbove, returnDays: shopSettings.returnDays, dispatchDays: shopSettings.dispatchDays, accent: shopSettings.accent, displayFont: shopSettings.displayFont, sells: shopSettings.sells })
    .from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).limit(1)
  const cols = await tx.select({ id: collections.id, handle: collections.handle, kind: collections.kind }).from(collections).where(eq(collections.tenantId, tenantId))
  const members = await tx.select({ c: collectionProducts.collectionId }).from(collectionProducts).where(eq(collectionProducts.tenantId, tenantId))
  const withProducts = new Set(members.map((m) => m.c))
  return {
    collections: cols.map((c) => ({ handle: c.handle, hasProducts: c.kind === 'auto' || withProducts.has(c.id) })),
    codOn: s?.codOn ?? false, freeShippingAbove: s?.freeShippingAbove == null ? null : Number(s.freeShippingAbove), returnDays: s?.returnDays ?? 0, dispatchDays: s?.dispatchDays ?? 0,
    accent: s?.accent ?? 'oxide', displayFont: s?.displayFont ?? 'fraunces', sells: s?.sells ?? [],
  }
}
