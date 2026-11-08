// The queue's tab COUNTS against the tab rule (order-state.ts queueTab) on a real Postgres (Ship plan review 3: the
// parity test held the tabs' predicates, not the counts that read them through a partial-index filter). Every one of
// shop A's orders is read, its tab decided in TypeScript, and the tallies must equal queueCountsWith's, after seeding
// one order in each state. Skipped unless INT_DB_HOST is set. One transaction, rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('queue counts', () => {
  it('every tab counts exactly the orders whose state belongs to it', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const { queueCountsWith } = await import('@/lib/queries/orders')
    const { momentColumns, placedSql } = await import('@/lib/db/order-predicates')
    const { orderState, queueTab, QUEUE_TABS } = await import('@/domains/orders/order-state')
    const { eq, sql } = await import('drizzle-orm')
    const now = new Date()
    const ago = (h: number) => new Date(now.getTime() - h * 3_600_000)
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      let n = 985_000 + Math.floor(Math.random() * 5_000)
      const add = (o: Partial<typeof orders.$inferInsert>) => tx.insert(orders).values({ tenantId: A, number: n++, paymentMethod: 'cod', placedAt: ago(48), subtotal: 100, total: 100, ...o })
      await add({}) // unconfirmed
      await add({ confirmedAt: ago(40) }) // confirmed
      await add({ heldAt: ago(40) }) // held
      await add({ paymentMethod: 'prepaid', payBy: ago(-1) }) // awaiting payment
      await add({ confirmedAt: ago(40), packedAt: ago(30), invoiceNumber: `QC/${n}` }) // packed
      await add({ confirmedAt: ago(40), packedAt: ago(30), invoiceNumber: `QC/${n}`, shippedAt: ago(20) }) // shipped
      await add({ confirmedAt: ago(40), packedAt: ago(30), invoiceNumber: `QC/${n}`, shippedAt: ago(20), ndrAt: ago(10) }) // ndr
      await add({ confirmedAt: ago(40), packedAt: ago(30), invoiceNumber: `QC/${n}`, shippedAt: ago(20), rtoInitiatedAt: ago(5) }) // rto
      await add({ confirmedAt: ago(40), packedAt: ago(30), invoiceNumber: `QC/${n}`, shippedAt: ago(20), deliveredAt: ago(5) }) // delivered
      await add({ confirmedAt: ago(40), packedAt: ago(30), invoiceNumber: `QC/${n}`, cancelledAt: ago(25) }) // cancelled after packing
      await add({ confirmedAt: ago(40), packedAt: ago(30), invoiceNumber: `QC/${n}`, shippedAt: ago(20), lostAt: ago(5) }) // lost by the courier
      await add({ confirmedAt: ago(40), packedAt: ago(30), invoiceNumber: `QC/${n}`, shippedAt: ago(20), rtoInitiatedAt: ago(5), rtoDeliveredAt: ago(2) }) // came back
      const rows = await tx.select({ ...momentColumns, placed: sql<boolean>`${placedSql()}` }).from(orders).where(eq(orders.tenantId, A))
      const want = Object.fromEntries(QUEUE_TABS.map((t) => [t, 0])) as Record<string, number>
      for (const r of rows) {
        const tab = queueTab(orderState(r, now))
        if (tab) want[tab]!++
        if (r.placed) want.all!++
      }
      expect(await queueCountsWith(tx, A, now)).toEqual(want)
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
