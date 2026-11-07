// Retiring sizes and colours (src/lib/catalogue/retire-variants.ts) on a real Postgres, tenant A of the proof.
// Skipped unless INT_DB_HOST is set (CI). Rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('retiring variants', () => {
  it('archives the ordered, deletes the never-ordered, refuses with pre-orders to pack, restores the same row', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { retireVariants, archivedVariants } = await import('@/lib/catalogue/retire-variants')
    const { eq } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-retire-${Date.now()}`, title: 'Int kurta', options: ['Size'], status: 'active' }).returning({ id: products.id })
      const [sold, never, pre] = await tx.insert(variants).values([
        { tenantId: A, productId: p!.id, optionValues: ['M'], price: 100000, stock: 2, sku: 'INT-M' },
        { tenantId: A, productId: p!.id, optionValues: ['L'], price: 100000, stock: 2, sku: 'INT-L' },
        { tenantId: A, productId: p!.id, optionValues: ['XL'], price: 100000, stock: 0, sku: 'INT-XL' },
      ]).returning({ id: variants.id })
      const [o] = await tx.insert(orders).values({ tenantId: A, number: 940_001, paymentMethod: 'cod', placedAt: new Date() }).returning({ id: orders.id })
      await tx.insert(orderLines).values([
        { tenantId: A, orderId: o!.id, variantId: sold!.id, title: 'M', qty: 1, unitPrice: 100000, taxableValue: 95238, kind: 'in_stock', stockTakenAt: new Date() },
        { tenantId: A, orderId: o!.id, variantId: pre!.id, title: 'XL', qty: 1, unitPrice: 100000, taxableValue: 95238, kind: 'preorder', position: 1 },
      ])
      expect(await retireVariants(tx, A, [pre!.id])).toMatchObject({ ok: false, error: expect.stringMatching(/XL has pre-orders still to pack/) })
      expect(await retireVariants(tx, A, [sold!.id, never!.id])).toEqual({ ok: true, archived: [sold!.id], deleted: [never!.id] })
      const [m] = await tx.select({ archivedAt: variants.archivedAt, sku: variants.sku }).from(variants).where(eq(variants.id, sold!.id))
      expect(m!.archivedAt).not.toBe(null)
      expect(m!.sku).toBe(null) // freed for reuse
      expect((await tx.select({ id: variants.id }).from(variants).where(eq(variants.id, never!.id))).length).toBe(0)
      const [line] = await tx.select({ v: orderLines.variantId }).from(orderLines).where(eq(orderLines.variantId, sold!.id))
      expect(line!.v).toBe(sold!.id) // the order still points at it
      expect((await archivedVariants(tx, A, p!.id)).map((a) => a.id)).toEqual([sold!.id])
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
