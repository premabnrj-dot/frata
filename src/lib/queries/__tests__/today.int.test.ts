// Home's summary (src/lib/queries/today.ts) on a real Postgres: shop A's counts, oldest waits, next order and week
// never include shop B's rows, and the week's days turn at IST midnight (18:30 UTC) as src/domains/time/day.ts says.
// Skipped unless INT_DB_HOST is set (CI). Commits rows in 2000–2001 under random numbers, so other tests never meet
// them (their "now" is 2026) and they are the oldest A and B have.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe.skipIf(!host)('todaySummary', () => {
  it('reads one shop only, every part of it; days turn at IST midnight', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { and, between, eq } = await import('drizzle-orm')
    const { orders } = await import('@/lib/db/schema-orders')
    const { todaySummary } = await import('@/lib/queries/today')
    const { riskFactsFor } = await import('@/lib/queries/order-risk')
    const { weekBars } = await import('@/domains/orders/today')
    const now = new Date('2001-01-07T06:00:00Z') // 11:30 IST on 7 Jan 2001
    // Above the 9xx,xxx numbers orders.int and order-risk.int use on A (one unique index per shop).
    const n = 2_000_000 + Math.floor(Math.random() * 900_000) * 2
    const before = await todaySummary(A, now)

    const add = (t: string, i: number, o: Record<string, unknown>) => withTenant(t, (tx) => tx.insert(orders)
      .values({ tenantId: t, number: n + i, paymentMethod: 'cod', customerName: `Today ${t === A ? 'A' : 'B'} ${i}`, subtotal: (o.total as number | undefined) ?? 100_00, total: 100_00, placedAt: now, ...o })
      .returning({ id: orders.id }).then((r) => r[0]!.id))
    // B: older than anything of A's, in every tab and on both days, so any leak shows as B's row winning.
    const bIds: string[] = []
    const bNext = await add(B, 100, { placedAt: new Date('2000-11-01T00:00:00Z') }); bIds.push(bNext)
    bIds.push(await add(B, 101, { placedAt: new Date('2000-11-01T00:00:00Z'), confirmedAt: new Date('2000-11-01T01:00:00Z') }))
    bIds.push(await add(B, 102, { placedAt: new Date('2000-11-01T00:00:00Z'), heldAt: new Date('2000-11-01T01:00:00Z') }))
    bIds.push(await add(B, 103, { placedAt: new Date('2001-01-06T18:29:59Z'), total: 7_00 }))
    bIds.push(await add(B, 104, { placedAt: new Date('2001-01-06T18:30:00Z'), total: 7_00 }))
    // A: the oldest to confirm (outside the week), one either side of IST midnight, one to pack, one on hold, one cancelled.
    const aNext = await add(A, 0, { placedAt: new Date('2000-12-01T00:00:00Z') })
    await add(A, 1, { placedAt: new Date('2001-01-06T18:29:59Z'), total: 250_00 })
    await add(A, 2, { placedAt: new Date('2001-01-06T18:30:00Z'), total: 300_00 })
    await add(A, 3, { placedAt: new Date('2000-12-02T00:00:00Z'), confirmedAt: new Date('2000-12-03T00:00:00Z') })
    await add(A, 4, { placedAt: new Date('2000-12-02T00:00:00Z'), heldAt: new Date('2000-12-04T00:00:00Z') })
    await add(A, 5, { placedAt: new Date('2001-01-07T01:00:00Z'), cancelledAt: new Date('2001-01-07T02:00:00Z') })
    // Three COD orders from one phone on one IST day: the third (and each after the third) is high risk by the rules.
    const phone = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
    const trio = [] as string[]
    for (const i of [6, 7, 8]) trio.push(await add(A, i, { placedAt: new Date(`2001-01-05T0${i - 3}:00:00Z`), phone, total: 9_00 }))

    try {
    const s = await todaySummary(A, now)
    // Other int files commit rows into A in parallel, so the counts are bounded here; queueCounts' own isolation is
    // orders.int.test.ts's. The leak checks below are exact: B's rows are the oldest anywhere, so a leak would win.
    expect(s.counts.to_confirm - before.counts.to_confirm).toBeGreaterThanOrEqual(3)
    expect(s.next?.id).toBe(aNext)
    expect(s.next?.id).not.toBe(bNext)
    expect(s.next?.since.toISOString()).toBe('2000-12-01T00:00:00.000Z')
    expect(s.oldest.to_pack?.toISOString()).toBe('2000-12-03T00:00:00.000Z')
    expect(s.oldest.on_hold?.toISOString()).toBe('2000-12-04T00:00:00.000Z')
    expect(typeof s.high).toBe('number')
    // The week: A's two orders either side of IST midnight on separate days, the cancelled one left out, B's never.
    const bars = weekBars(s.week, now)
    expect(bars.find((b) => b.day === '2001-01-06')).toMatchObject({ orders: 1, value: 250_00 })
    expect(bars.find((b) => b.day === '2001-01-07')).toMatchObject({ orders: 1, value: 300_00 })
    expect(bars.reduce((t, b) => t + b.orders, 0)).toBe(5) // the two above and the trio on 5 Jan
    // Another shop's id handed to A's risk read drops out; the whole-tab read (Home's) holds A's rows and none of B's.
    expect((await riskFactsFor(A, [bNext], now)).size).toBe(0)
    const { riskFactsWith } = await import('@/lib/queries/order-risk')
    const tab = await withTenant(A, (tx) => riskFactsWith(tx, A, { tab: 'to_confirm' }, now))
    expect(tab.has(aNext)).toBe(true)
    const { risk } = await import('@/domains/orders/risk')
    expect(risk(tab.get(trio[2]!)!).level).toBe('high')
    expect(s.high! - before.high!).toBeGreaterThanOrEqual(1) // only grows with parallel runs; B's never count (above)
    expect([...bIds].some((id) => tab.has(id))).toBe(false)
    } finally {
      // Cancel this run's rows: out of every tab and the week, so the next run on the same database starts clean.
      for (const t of [A, B]) await withTenant(t, (tx) => tx.update(orders).set({ cancelledAt: new Date() }).where(and(eq(orders.tenantId, t), between(orders.number, n, n + 200))))
    }
  })
})
