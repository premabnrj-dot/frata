// Stock on a real Postgres (migrated by scripts/verify/tenancy.sh; tenant A of the proof): takeStock per line
// with one line short, idempotent; pre-order demand owed until packed. Skipped unless INT_DB_HOST is set (CI).
// Everything it writes is rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('stock per line', () => {
  it('takes what is there, stamps only that, takes nothing twice; owed counts unpacked pre-orders only', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { takeStock } = await import('@/lib/orders/stock')
    const { variantRows } = await import('@/lib/queries/checkout')
    const { and, eq } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-stock-${Date.now()}`, title: 'Int kurta', options: ['Size'], status: 'active' }).returning({ id: products.id })
      const [plenty, scarce] = await tx.insert(variants).values([
        { tenantId: A, productId: p!.id, optionValues: ['M'], price: 100000, stock: 5 },
        { tenantId: A, productId: p!.id, optionValues: ['L'], price: 100000, stock: 1 },
      ]).returning({ id: variants.id })
      const [o] = await tx.insert(orders).values({ tenantId: A, number: 910_001, paymentMethod: 'cod', placedAt: new Date() }).returning({ id: orders.id })
      await tx.insert(orderLines).values([
        { tenantId: A, orderId: o!.id, variantId: plenty!.id, title: 'M', qty: 2, unitPrice: 100000, taxableValue: 95238, kind: 'in_stock', position: 0 },
        { tenantId: A, orderId: o!.id, variantId: scarce!.id, title: 'L', qty: 3, unitPrice: 100000, taxableValue: 95238, kind: 'in_stock', position: 1 },
      ])
      const stockOf = async (id: string) => (await tx.select({ s: variants.stock }).from(variants).where(eq(variants.id, id)))[0]!.s
      const stamped = async () => (await tx.select({ v: orderLines.variantId, at: orderLines.stockTakenAt }).from(orderLines).where(eq(orderLines.orderId, o!.id)))
        .map((l) => [l.v === plenty!.id ? 'M' : 'L', !!l.at])

      const soldOut: string[] = []
      expect(await takeStock(tx, A, o!.id, 'in_stock', soldOut)).toEqual({ short: 1, taken: 1 })
      expect(soldOut).toEqual([]) // 5 - 2 = 3: not sold out
      expect(await stockOf(plenty!.id)).toBe(3)
      expect(await stockOf(scarce!.id)).toBe(1) // 3 wanted, 1 there: none taken
      expect(Object.fromEntries(await stamped())).toEqual({ M: true, L: false })
      // Again (a webhook after the browser): the taken line is not taken twice; the short one is still short.
      expect(await takeStock(tx, A, o!.id)).toEqual({ short: 1, taken: 0 })
      expect(await stockOf(plenty!.id)).toBe(3)
      // The last piece: reported so the caller refreshes the shop.
      const [last] = await tx.insert(orders).values({ tenantId: A, number: 910_003, paymentMethod: 'cod', placedAt: new Date() }).returning({ id: orders.id })
      await tx.insert(orderLines).values({ tenantId: A, orderId: last!.id, variantId: scarce!.id, title: 'L', qty: 1, unitPrice: 100000, taxableValue: 95238, kind: 'in_stock' })
      const gone: string[] = []
      await takeStock(tx, A, last!.id, 'in_stock', gone)
      expect(gone).toEqual([scarce!.id])

      // Pre-orders: owed while unpacked, not once packed (or shipped), not once their stock is taken.
      const [pre] = await tx.insert(orders).values({ tenantId: A, number: 910_002, paymentMethod: 'cod', placedAt: new Date() }).returning({ id: orders.id })
      await tx.insert(orderLines).values({ tenantId: A, orderId: pre!.id, variantId: scarce!.id, title: 'L', qty: 2, unitPrice: 100000, taxableValue: 95238, kind: 'preorder' })
      const owed = async () => (await variantRows(tx, A, [scarce!.id], new Date()))[0]!.owed
      expect(await owed()).toBe(2)
      // The product page reads the same figure (storefront variantCols → owedSql).
      const { owedSql } = await import('@/lib/db/order-predicates')
      expect((await tx.select({ n: owedSql(A, new Date()) }).from(variants).where(eq(variants.id, scarce!.id)))[0]!.n).toBe(2)
      await tx.update(orders).set({ packedAt: new Date(), invoiceNumber: 'INT/26-27/00001' }).where(and(eq(orders.tenantId, A), eq(orders.id, pre!.id)))
      expect(await owed()).toBe(0)
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
