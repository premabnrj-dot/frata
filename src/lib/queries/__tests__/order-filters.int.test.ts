// Orders' filters on a real Postgres (Neel N1c): each filter narrows the list, the tab's count, countOrders and a
// saved view's count the same way, inside the shop only. Skipped unless INT_DB_HOST is set (CI).
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe.skipIf(!host)('order filters', () => {
  it('list, tab count, countOrders and a view count agree under each filter; another shop never counts', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const { listOrders, queueCounts, countOrders } = await import('@/lib/queries/orders')
    const { viewCounts } = await import('@/lib/queries/saved-views')
    const { parseFilters } = await import('@/domains/orders/filters')
    // A state no other test writes, so the counts are this test's own whatever else the database holds.
    const n = 870_000 + Math.floor(Math.random() * 9_000)
    const now = new Date()
    const phone = () => `95${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    const cases: [Record<string, string>, number][] = [
      [{ st: '38' }, 3], [{ st: '38', min: '1000' }, 2], [{ st: '38', max: '1000' }, 1], [{ st: '38', placed: '30d' }, 2],
      [{ st: '38', pay: 'paid' }, 3], [{ st: '38', pay: 'cod' }, 0], [{ st: '38', min: '1000', max: '2000' }, 1],
    ]
    // Counts before this test's rows, so a second run on the same database measures only what it added.
    const counts = async (filters: ReturnType<typeof parseFilters>) => [
      (await queueCounts(A, now, filters)).all, await countOrders(A, { tab: 'all', filters, now }),
      (await viewCounts(A, [{ id: 'v', name: 'v', tab: 'all', filters, query: '' }], now))?.v ?? -1,
    ]
    const before = await Promise.all(cases.map(([p]) => counts(parseFilters(p))))
    for (const t of [A, B]) {
      await withTenant(t, (tx) => tx.insert(orders).values([
        { tenantId: t, number: n + (t === A ? 0 : 10), paymentMethod: 'prepaid', paidAt: now, placedAt: now, state: 'Ladakh', phone: phone(), customerName: 'F1', subtotal: 50000, total: 50000 },
        { tenantId: t, number: n + (t === A ? 1 : 11), paymentMethod: 'prepaid', paidAt: now, placedAt: new Date(now.getTime() - 40 * 86_400_000), state: 'Ladakh', phone: phone(), customerName: 'F2', subtotal: 300000, total: 300000 },
        { tenantId: t, number: n + (t === A ? 2 : 12), paymentMethod: 'prepaid', paidAt: now, placedAt: now, state: 'Ladakh', phone: phone(), customerName: 'F3', subtotal: 150000, total: 150000 },
      ]))
    }
    for (const [i, [params, want]] of cases.entries()) {
      const filters = parseFilters(params)
      const list = (await listOrders(A, { tab: 'all', filters, now })).filter((o) => o.number >= n && o.number < n + 3)
      expect(list.length, JSON.stringify(params)).toBe(want)
      // The tab count, countOrders and a view's count each grew by exactly what the list shows (B's rows never count).
      const after = await counts(filters)
      expect(after.map((x, k) => x - before[i]![k]!), JSON.stringify(params)).toEqual([want, want, want])
    }
  })
})
