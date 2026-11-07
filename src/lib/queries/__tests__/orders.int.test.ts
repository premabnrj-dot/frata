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
    const tag = `Srch${Math.floor(Math.random() * 1e6)}`
    const n = 970_000 + Math.floor(Math.random() * 20_000)
    const phone = `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    for (const [t, i] of [[A, 0], [B, 1]] as const) {
      await withTenant(t, (tx) => tx.insert(orders).values({ tenantId: t, number: n + i, paymentMethod: 'cod', placedAt: new Date(), customerName: `${tag} Sharma`, phone, subtotal: 100, total: 100 }))
    }
    const now = new Date()
    const mine = await listOrders(A, { tab: 'all', q: tag, now })
    expect(mine.map((o) => o.number)).toEqual([n]) // B's same-named order never shows
    expect(mine[0]!.matching).toBe(1)
    expect((await listOrders(A, { tab: 'all', q: phone, now })).map((o) => o.number)).toEqual([n])
    expect((await listOrders(A, { tab: 'all', q: `KS-${n + 1}`, now })).length).toBe(0) // B's number, from A
    expect((await listOrders(A, { tab: 'all', q: '%', now })).some((o) => o.number === n)).toBe(false) // % is text, not "everything"
  })
})
