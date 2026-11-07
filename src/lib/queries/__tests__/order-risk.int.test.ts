// The risk facts query (src/lib/queries/order-risk.ts) on a real Postgres, tenant A of the proof, then the rules.
// Skipped unless INT_DB_HOST is set (CI). It commits rows under a random phone so runs do not meet.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe.skipIf(!host)('risk facts', () => {
  it('counts per phone against each order’s own time: duplicate, today, fake, first order; another shop never counts', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { riskFactsFor } = await import('@/lib/queries/order-risk')
    const { risk } = await import('@/domains/orders/risk')
    const phone = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
    const t0 = new Date('2026-11-07T04:00:00Z') // 09:30 IST
    const at = (h: number) => new Date(t0.getTime() + h * 3_600_000)
    const n = 960_000 + Math.floor(Math.random() * 30_000)
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const [p] = await withTenant(A, (tx) => tx.insert(products).values({ tenantId: A, handle: `int-risk-${n}`, title: 'Int kurta', options: ['Size'], status: 'active' }).returning({ id: products.id }))
    const [vm, vl] = await withTenant(A, (tx) => tx.insert(variants).values([
      { tenantId: A, productId: p!.id, optionValues: ['M'], price: 249000, stock: 9 }, { tenantId: A, productId: p!.id, optionValues: ['L'], price: 249000, stock: 9 },
    ]).returning({ id: variants.id }))
    const place = (tenant: string, i: number, o: Partial<typeof orders.$inferInsert> = {}, variantId: string | null = null) => withTenant(tenant, async (tx) => {
      const [r] = await tx.insert(orders).values({ tenantId: tenant, number: n + i, paymentMethod: 'cod', placedAt: at(i), phone, customerName: 'Ananya Sharma', addressLine: 'B-14, Tilak Marg', city: 'Jaipur', total: 249000, subtotal: 249000, ...o }).returning({ id: orders.id })
      await tx.insert(orderLines).values({ tenantId: tenant, orderId: r!.id, variantId, title: 'Kurta', qty: 1, unitPrice: 249000, taxableValue: 237143 })
      return r!.id
    })
    // The same phone in shop B must never count for shop A.
    await place(B, 0, { cancelledAt: at(0), cancelReason: 'fake' })
    const first = await place(A, 1, {}, vm!.id)
    const second = await place(A, 2, {}, vl!.id)   // other items: not a duplicate
    const third = await place(A, 3, {}, vm!.id)    // the same items as the first, 2 hours later: a duplicate
    const f = await riskFactsFor(A, [first, second, third], at(4))
    expect(f.get(first)).toMatchObject({ earlierOrders: 0, cancelledAsFake: 0, codFromPhoneToday: 1, sameItemsWithin24h: 0 })
    expect(f.get(second)).toMatchObject({ earlierOrders: 1, codFromPhoneToday: 2, sameItemsWithin24h: 0 })
    expect(f.get(third)).toMatchObject({ codFromPhoneToday: 3, sameItemsWithin24h: 1 })
    expect(risk(f.get(third)!).level).toBe('high')
    expect(risk(f.get(first)!).level).toBe('low') // first order alone is one signal
  })
})
