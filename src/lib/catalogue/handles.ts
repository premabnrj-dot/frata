import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { presetsFor } from '@/domains/catalogue/size-charts'
import { handleFor } from '@/domains/catalogue/variants'
import type { Tx } from '@/lib/db'
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
export async function freeHandle(tx: Tx, tenantId: string, title: string, exceptId?: string): Promise<string> {
  const base = handleFor(title) || 'product'
  const taken = await tx.select({ handle: products.handle, id: products.id }).from(products)
    .where(and(eq(products.tenantId, tenantId), sql`${products.handle} = ${base} or ${products.handle} like ${base + '-%'}`))
  // Old addresses stay reserved for the product that had them (they redirect to it).
  const old = await tx.select({ handle: productHandleHistory.handle, id: productHandleHistory.productId }).from(productHandleHistory)
    .where(and(eq(productHandleHistory.tenantId, tenantId), sql`${productHandleHistory.handle} = ${base} or ${productHandleHistory.handle} like ${base + '-%'}`))
  const used = new Set([...taken, ...old].filter((t) => t.id !== exceptId).map((t) => t.handle))
  if (!used.has(base)) return base
  for (let n = 2; n < 1000; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${Date.now()}`
}

/** Is `handle` free for this product: not another product's, and not another product's old address. */
export async function handleFree(tx: Tx, tenantId: string, handle: string, productId: string) {
  const [a] = await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.handle, handle), sql`${products.id} <> ${productId}`)).limit(1)
  if (a) return false
  const [b] = await tx.select({ id: productHandleHistory.productId }).from(productHandleHistory).where(and(eq(productHandleHistory.tenantId, tenantId), eq(productHandleHistory.handle, handle), sql`${productHandleHistory.productId} <> ${productId}`)).limit(1)
  return !b
}

