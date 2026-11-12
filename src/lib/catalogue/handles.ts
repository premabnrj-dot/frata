import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { presetsFor } from '@/domains/catalogue/size-charts'
import { handleFor } from '@/domains/catalogue/variants'
import type { Tx } from '@/lib/db'
import { arrayParam } from '@/lib/db/sql-array'
import { shopSettings } from '@/lib/db/schema'
import { productHandleHistory, products, productTypes } from '@/lib/db/schema-catalogue'

// A product's address and its shop's starting size charts: the helpers Products' actions share (inside the caller's
// tenant transaction; every read names the tenant).

/** The shop's starting size charts, made the first time they are needed (from what it said it sells). */
export async function ensureTypes(tx: Tx, tenantId: string) {
  const existing = await tx.select({ id: productTypes.id }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).limit(1)
  if (existing.length) return
  const [s] = await tx.select({ sells: shopSettings.sells }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
  const presets = presetsFor((s?.sells ?? []) as Parameters<typeof presetsFor>[0])
  await tx.insert(productTypes).values(presets.map((p) => ({ tenantId, name: p.name, sizeChart: p.chart }))).onConflictDoNothing()
}

/** A free handle: "linen-kurta-set", else "-2", "-3"… within this shop. */
export async function freeHandle(tx: Tx, tenantId: string, title: string): Promise<string> {
  return (await freeHandles(tx, tenantId, [handleFor(title) || 'product']))[0]!
}

/** Room left for a "-N" suffix inside the 100 characters a handle may have. */
const stemOf = (base: string) => base.slice(0, 94).replace(/-+$/, '')

/** What a handle or SKU is without its trailing digits: "kurta-12" → "kurta-", "kurta" → "kurta". */
export const undigit = (s: string) => s.replace(/[0-9]+$/, '')

/**
 * Handles this shop's products have or had whose form without trailing digits is one of `keys` (undigit of a base,
 * and a stem + "-" for its "-N" forms). A superset of the exact ones is harmless: each is a real taken handle. One
 * cheap rtrim per row, no regex: the 10× read stays under 10 ms (write.int.test.ts, SPEED=1).
 */
export const takenHandles = (tx: Tx, tenantId: string, keys: string[]) => {
  const of = (col: typeof products.handle | typeof productHandleHistory.handle) => sql`rtrim(${col}, '0123456789') = any(${arrayParam(keys, 'text')})`
  return tx.select({ handle: products.handle }).from(products).where(and(eq(products.tenantId, tenantId), of(products.handle)))
    .union(tx.select({ handle: productHandleHistory.handle }).from(productHandleHistory).where(and(eq(productHandleHistory.tenantId, tenantId), of(productHandleHistory.handle))))
}

/**
 * Free handles for many new products in ONE read (the import's chunks, plan 2026-11-12-product-import PI·0): each base
 * as it is, else "-2", "-3"…, never one another product has or had (old addresses stay reserved for the product that
 * had them: they redirect to it), never two alike in the batch. `bases` are handle-shaped (handleFor).
 */
export async function freeHandles(tx: Tx, tenantId: string, bases: string[]): Promise<string[]> {
  if (!bases.length) return []
  if (bases.some((b) => !/^[a-z0-9-]{1,100}$/.test(b))) throw new Error('freeHandles: not a handle')
  const taken = await takenHandles(tx, tenantId, [...new Set(bases.flatMap((b) => [undigit(b), `${stemOf(b)}-`]))])
  const used = new Set(taken.map((t) => t.handle))
  return bases.map((base) => {
    let h = base
    for (let n = 2; used.has(h); n++) h = `${stemOf(base)}-${n}`
    used.add(h)
    return h
  })
}

/** Is `handle` free for this product: not another product's, and not another product's old address. */
export async function handleFree(tx: Tx, tenantId: string, handle: string, productId: string) {
  const [a] = await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.handle, handle), sql`${products.id} <> ${productId}`)).limit(1)
  if (a) return false
  const [b] = await tx.select({ id: productHandleHistory.productId }).from(productHandleHistory).where(and(eq(productHandleHistory.tenantId, tenantId), eq(productHandleHistory.handle, handle), sql`${productHandleHistory.productId} <> ${productId}`)).limit(1)
  return !b
}

