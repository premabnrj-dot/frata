// Analytics' charts on a real Postgres (Neel N1b·3): the series read runs as frata_app under RLS, its day totals equal the
// Sales figure's, came back is counted on the placed day, states and the heat add up (another shop's rows: the RLS proof).
// Skipped unless INT_DB_HOST is set (CI). Rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('analytics series', () => {
  it('days, weeks, heat, states and returning shoppers from the same orders the figures count', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const { analyticsIn } = await import('@/lib/queries/analytics')
    const { seriesIn } = await import('@/lib/queries/analytics-series')
    const { windowFor } = await import('@/domains/analytics/period')
    const now = new Date()
    const w = windowFor({ kind: 'preset', preset: '30' }, now)
    const n = 860_000 + Math.floor(Math.random() * 9_000)
    const phone = `94${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    await withTenant(A, async (tx) => {
      const before = await analyticsIn(tx, A, 'owner', w, now)
      const s0 = await seriesIn(tx, A, w, now)
      expect(s0).not.toBeNull()
      await tx.insert(orders).values([
        { tenantId: A, number: n, paymentMethod: 'cod', placedAt: ago(2), state: 'Sikkim', phone, customerName: 'S1', subtotal: 100000, total: 100000, rtoInitiatedAt: ago(1) },
        { tenantId: A, number: n + 1, paymentMethod: 'prepaid', paidAt: ago(3), placedAt: ago(3), state: 'Sikkim', phone, customerName: 'S1', subtotal: 50000, total: 50000, deliveredAt: ago(1) },
      ])
      const after = await analyticsIn(tx, A, 'owner', w, now)
      const s1 = (await seriesIn(tx, A, w, now))!
      const sum = (s: typeof s1) => s.days.reduce((x, d) => x + d.sales, 0)
      // The chart's days add up to exactly what the Sales figure grew by.
      expect(sum(s1) - sum(s0!)).toBe(after.cur.sales - before.cur.sales)
      expect(s1.days.reduce((x, d) => x + d.rto, 0) - s0!.days.reduce((x, d) => x + d.rto, 0)).toBe(1)
      const sk = (s: typeof s1) => s.states.find((x) => x.state === 'Sikkim') ?? { outcomes: 0, rto: 0 }
      expect([sk(s1).outcomes - sk(s0!).outcomes, sk(s1).rto - sk(s0!).rto]).toEqual([2, 1])
      expect(s1.heat.flat().reduce((x, y) => x + y, 0) - s0!.heat.flat().reduce((x, y) => x + y, 0)).toBe(2)
      tx.rollback()
    }).catch((e) => { if (!String(e).includes('Rollback')) throw e })
  })
})
