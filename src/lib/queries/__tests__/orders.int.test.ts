// The queue's list and search (src/lib/queries/orders.ts) on a real Postgres: shop A searches and never sees
// shop B's matching order. Skipped unless INT_DB_HOST is set (CI). Commits rows under a random name.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe.skipIf(!host)('order search', () => {
  it('finds by name, number and phone within the shop only; escapes wildcards', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const { listOrders } = await import('@/lib/queries/orders')
    const tag = `Srch${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 8)}` // letters only: digits and letters together read as a tracking number (N1c)
    const n = 970_000 + Math.floor(Math.random() * 20_000)
    const phone = `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    for (const [t, i] of [[A, 0], [B, 1]] as const) {
      await withTenant(t, (tx) => tx.insert(orders).values({ tenantId: t, number: n + i, paymentMethod: 'cod', placedAt: new Date(), customerName: `${tag} Sharma`, phone, subtotal: 100, total: 100 }))
    }
    const now = new Date()
    const mine = await listOrders(A, { tab: 'all', q: tag, now })
    expect(mine.map((o) => o.number)).toEqual([n]) // B's same-named order never shows
    expect(mine.length).toBe(1)
    expect((await listOrders(A, { tab: 'all', q: phone, now })).map((o) => o.number)).toEqual([n])
    expect((await listOrders(A, { tab: 'all', q: `KS-${n + 1}`, now })).length).toBe(0) // B's number, from A
    expect((await listOrders(A, { tab: 'all', q: '%', now })).some((o) => o.number === n)).toBe(false) // % is text, not "everything"
  })

  it('a tracking number finds its own order only, in the shop only, and says what matched (N1c)', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, shipments } = await import('@/lib/db/schema-orders')
    const { listOrders } = await import('@/lib/queries/orders')
    const n = 880_000 + Math.floor(Math.random() * 9_000) // a range no other test uses
    const awb = `AWB${Math.floor(Math.random() * 1e9)}`
    for (const [t, i] of [[A, 0], [B, 1]] as const) {
      await withTenant(t, async (tx) => {
        const [o] = await tx.insert(orders).values({ tenantId: t, number: n + i, paymentMethod: 'prepaid', paidAt: new Date(), placedAt: new Date(), customerName: 'Track', phone: `97${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, subtotal: 100, total: 100 }).returning({ id: orders.id })
        // Paid online, so they never move the shop's COD median (the risk test reads it). A's other order shipped too, under another number: an unqualified id in the subquery once matched every order.
        const [o2] = await tx.insert(orders).values({ tenantId: t, number: n + 10 + i, paymentMethod: 'prepaid', paidAt: new Date(), placedAt: new Date(), customerName: 'Other', phone: `96${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, subtotal: 100, total: 100 }).returning({ id: orders.id })
        await tx.insert(shipments).values([{ tenantId: t, orderId: o!.id, provider: 'self', trackingNumber: awb }, { tenantId: t, orderId: o2!.id, provider: 'self', trackingNumber: `${awb}X` }])
      })
    }
    const hits = await listOrders(A, { tab: 'all', q: awb, now: new Date() })
    expect(hits.map((o) => o.number)).toEqual([n])
    expect(hits[0]!.awb).toBe(awb)
  })

  it('a search looks through every order, whatever tab is open; without one, the tab alone (2026-11-12)', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const { listOrders } = await import('@/lib/queries/orders')
    const { orderState } = await import('@/domains/orders/order-state')
    const tag = `Every${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 8)}`
    const n = 950_000 + Math.floor(Math.random() * 20_000) * 3
    const now = new Date(), past = new Date(now.getTime() - 3_600_000)
    await withTenant(A, async (tx) => {
      const o = { tenantId: A, placedAt: past, customerName: `${tag} Rao`, subtotal: 100, total: 100 }
      await tx.insert(orders).values([
        { ...o, number: n, paymentMethod: 'cod' }, // to confirm
        { ...o, number: n + 1, paymentMethod: 'prepaid', payBy: new Date(now.getTime() + 3_600_000) }, // not paid yet
        { ...o, number: n + 2, paymentMethod: 'cod', confirmedAt: past, cancelledAt: past }, // cancelled
      ])
    })
    const hits = await listOrders(A, { tab: 'on_the_way', q: tag, now })
    expect(hits.map((h) => h.number).sort()).toEqual([n, n + 1, n + 2])
    expect(hits.length).toBe(3)
    expect(hits.map((h) => orderState(h, now)).sort()).toEqual(['awaiting_payment', 'cancelled', 'unconfirmed'])
    // No search: the tab's orders only.
    expect((await listOrders(A, { tab: 'on_the_way', now })).some((h) => h.number >= n && h.number <= n + 2)).toBe(false)
  })

  it('Settings › Taxes: the live products a registered shop can\'t sell for want of a rate', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { products } = await import('@/lib/db/schema-catalogue')
    const { liveWithoutRateIn } = await import('@/lib/queries/catalogue')
    const ROLLBACK = new Error('rollback')
    const k = `int-rate-${Date.now()}`
    await withTenant(A, async (tx) => {
      const before = await liveWithoutRateIn(tx, A, new Date())
      const p = (handle: string, o: Partial<typeof products.$inferInsert>) => ({ tenantId: A, handle: `${k}-${handle}`, title: `${k} ${handle}`, options: ['Size'], status: 'active', ...o })
      await tx.insert(products).values([
        p('a', { hsn: '6109' }), // the table knows it
        p('b', { hsn: '2106' }), // unknown code, no rate of her own: can't be bought
        p('c', {}), // no HSN: can't be bought
        p('d', { hsn: '2106', gstBps: 500 }), // her own rate
        p('e', { status: 'draft' }), // not live
        p('f', { status: 'unlisted' }), // live, no HSN
      ])
      const after = await liveWithoutRateIn(tx, A, new Date())
      expect(after.count - before.count).toBe(3)
      expect(after.products.length).toBeLessThanOrEqual(3)
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
