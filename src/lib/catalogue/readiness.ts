import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { availability, type WhenOut } from '@/domains/catalogue/availability'
import { labelAsked, labelMissing, readLabel } from '@/domains/catalogue/label'
import { readiness, type Readiness } from '@/domains/catalogue/product-form'
import { isSizeOption } from '@/domains/storefront/picker'
import { hasRate } from '@/domains/tax/rates'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import type { Tx } from '@/lib/db'
import { shopSettings } from '@/lib/db/schema'
import { productImages, products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { arrayParam } from '@/lib/db/sql-array'

// =============================================================================
// FILE: src/lib/catalogue/readiness.ts
//
// GOING LIVE: the one write that makes products live (goLive: Publish in the editor, the import's "Publish the N
// ready"), and WHAT EACH PRODUCT STILL NEEDS BEFORE SHOPPERS SEE IT, for many at once, inside the caller's tenant transaction: the
// one read behind Publish (setStatus) and the import's Done step ("Need photos", "Need a GST rate", "Publish the N
// ready"). The rule itself is `readiness` (domains/catalogue/product-form.ts); this only gathers its facts, one read
// per table whatever the count.
// =============================================================================

export type Facts = { readiness: Readiness; photos: number; taxReady: boolean | undefined }

export async function readinessIn(tx: Tx, tenantId: string, ids: readonly string[], now: Date): Promise<Map<string, Facts>> {
  if (!ids.length) return new Map()
  const list = arrayParam([...ids], 'uuid')
  const [rows, vs, photos, [shop]] = await Promise.all([
    tx.select({ id: products.id, title: products.title, options: products.options, hsn: products.hsn, gstBps: products.gstBps, label: products.label, chart: productTypes.sizeChart })
      .from(products).leftJoin(productTypes, and(eq(productTypes.tenantId, tenantId), eq(productTypes.id, products.typeId)))
      .where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${list})`)),
    tx.select({ productId: variants.productId, price: variants.price, stock: variants.stock, whenOut: variants.whenOut, shipsBy: variants.shipsBy,
      leadMinDays: variants.leadMinDays, leadMaxDays: variants.leadMaxDays, preorderCap: variants.preorderCap })
      .from(variants).where(and(eq(variants.tenantId, tenantId), sql`${variants.productId} = any(${list})`, isNull(variants.archivedAt))),
    tx.select({ productId: productImages.productId, n: sql<number>`count(*)::int` }).from(productImages)
      .where(and(eq(productImages.tenantId, tenantId), sql`${productImages.productId} = any(${list})`)).groupBy(productImages.productId),
    tx.select({ gstin: shopSettings.gstin, scheme: shopSettings.gstScheme, sells: shopSettings.sells }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
  ])
  const taxed = !!shop && chargesGst({ gstin: shop.gstin, scheme: shop.scheme as Scheme })
  const asksLabel = !!shop && labelAsked(shop.sells)
  const n = new Map(photos.map((p) => [p.productId, p.n]))
  const out = new Map<string, Facts>()
  for (const p of rows) {
    const mine = vs.filter((v) => v.productId === p.id)
    const taxReady = taxed ? !!p.hsn && hasRate(p.hsn, now, p.gstBps) : undefined
    out.set(p.id, {
      photos: n.get(p.id) ?? 0, taxReady,
      readiness: readiness({
        title: p.title, photos: n.get(p.id) ?? 0, prices: mine.map((v) => Number(v.price)), hasSizes: p.options.some(isSizeOption),
        chartRows: p.chart?.rows.length ?? 0, taxReady, labelMissing: asksLabel ? labelMissing(readLabel(p.label)) : undefined,
        anyBuyable: mine.some((v) => availability({ stock: v.stock, whenOut: v.whenOut as WhenOut, shipsBy: v.shipsBy, leadMinDays: v.leadMinDays, leadMaxDays: v.leadMaxDays, preorderCap: v.preorderCap }, now).canBuy),
      }),
    })
  }
  return out
}

/**
 * Makes products live: Active (or Unlisted), now or from `at` (a scheduled drop). The first time it is live is kept
 * (`published_at`, from then on its address is fixed; a scheduled drop counts from its moment). The caller has
 * checked readinessIn and holds the rows.
 */
export async function goLive(tx: Tx, tenantId: string, ids: readonly string[], now: Date, opts: { status?: 'active' | 'unlisted'; at?: Date | null } = {}): Promise<number> {
  if (!ids.length) return 0
  const at = opts.at ?? null
  const first = at && at > now ? at : now
  const done = await tx.update(products).set({
    status: opts.status ?? 'active', publishAt: at, archivedAt: null, updatedAt: now,
    publishedAt: sql`coalesce(${products.publishedAt}, ${first.toISOString()}::timestamptz)`,
  }).where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${arrayParam([...ids], 'uuid')})`)).returning({ id: products.id })
  return done.length
}
