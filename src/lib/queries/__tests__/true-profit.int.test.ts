// True Profit on a real Postgres (plan docs/plans/2026-11-12-true-profit-a3.md, review Arch B2): products add up to the
// shop's ₹ kept (each line carries its weight of its order's money; rounding per group), a returned line is counted on
// its own product, and a PIN code appears only from 5 orders. Tenant A of the proof, in a far window, rolled back.
// Skipped unless INT_DB_HOST is set (CI).
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('True Profit: by product and by PIN code, through keptOf', () => {
  it('products add up to the total; returns land on their product; PIN codes from 5 orders', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { shopSettings } = await import('@/lib/db/schema')
    const tp = await import('@/lib/queries/true-profit')
    const { eq } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    const now = new Date('2033-03-01T10:00:00Z')
    const at = (h: number) => new Date(now.getTime() - h * 3_600_000)
    let n = 960_000 + Math.floor(Math.random() * 9_000)

    await withTenant(A, async (tx) => {
      await tx.update(shopSettings).set({ shipCostDelivery: 7000, shipCostReturn: 7000, shipCostCod: 3600, shipCostsConfirmedAt: now }).where(eq(shopSettings.tenantId, A))
      const product = async (title: string) => {
        const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-tp-${title.toLowerCase().replace(/ /g, "-")}-${Date.now()}`, title, options: ['Size'], status: 'active' }).returning({ id: products.id })
        const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 100000, stock: 0 }).returning({ id: variants.id })
        return { p: p!.id, v: v!.id }
      }
      const kurta = await product('Int kurta'), dupatta = await product('Int dupatta')
      // An order: a kurta (₹2,490 taxable 2,371.43) and a dupatta (₹300 → 285.71), shipped, then delivered or returned.
      const order = async (outcome: 'delivered' | 'rto', pincode: string) => {
        const [o] = await tx.insert(orders).values({ tenantId: A, number: n++, paymentMethod: 'cod', placedAt: at(48), confirmedAt: at(47), packedAt: at(46), shippedAt: at(40),
          deliveredAt: outcome === 'delivered' ? at(10) : null, rtoInitiatedAt: outcome === 'rto' ? at(10) : null, pincode,
          invoiceNumber: `TP/${n % 1e5}/${Date.now() % 1e5}`, subtotal: 279000, total: 279000, merchandiseNet: 265714, cogs: 120000 }).returning({ id: orders.id })
        await tx.insert(orderLines).values([
          { tenantId: A, orderId: o!.id, variantId: kurta.v, productId: kurta.p, title: 'Int kurta', qty: 1, unitPrice: 249000, taxableValue: 237143, unitCost: 100000, kind: 'in_stock', stockTakenAt: at(48) },
          { tenantId: A, orderId: o!.id, variantId: dupatta.v, productId: dupatta.p, title: 'Int dupatta', qty: 1, unitPrice: 30000, taxableValue: 28571, unitCost: 20000, kind: 'in_stock', stockTakenAt: at(48), position: 1 },
        ])
      }
      for (let i = 0; i < 4; i++) await order('delivered', '302012')
      await order('rto', '302012')
      await order('delivered', '845401') // one order: never its own row

      const d = await tp.trueProfitIn(tx, A, 'owner', 7, now)
      expect(d).not.toBeNull()
      const mine = d!.products.filter((p) => p.id === kurta.p || p.id === dupatta.p)
      expect(mine.map((p) => [p.name, p.delivered, p.returned])).toEqual(expect.arrayContaining([['Int kurta', 5, 1], ['Int dupatta', 5, 1]]))
      // Rounding is per group: the products' sum is within a few paise of the orders' own ₹ kept.
      const sumKept = mine.reduce((a, p) => a + p.kept, 0)
      expect(Math.abs(sumKept - d!.total.kept)).toBeLessThanOrEqual(10)
      // The kurta carries 89% of each parcel's freight and fees, and its own cost.
      const k = mine.find((p) => p.name === 'Int kurta')!, du = mine.find((p) => p.name === 'Int dupatta')!
      expect(k.kept).toBeGreaterThan(du.kept)
      const pin = d!.pincodes.find((r) => r.pincode === '302012')
      expect(pin).toMatchObject({ codOrders: 5, codReturned: 1 })
      expect(d!.pincodes.find((r) => r.pincode === '845401')).toBeUndefined()
      // A staff member never sees costs.
      expect(await tp.trueProfitIn(tx, A, 'staff', 7, now)).toBeNull()
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
