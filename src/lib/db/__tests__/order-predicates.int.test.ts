// THE PARITY TEST: src/lib/db/order-predicates.ts against src/domains/orders/order-state.ts on the same rows of
// a real Postgres (migrated by scripts/verify/tenancy.sh, so tenant A of the proof exists). Skipped unless
// INT_DB_HOST is set (CI sets it). Everything it writes is rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

/** A small seeded generator, so a failure names a case that comes back on the next run. */
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) }

describe.skipIf(!host)('order predicates match orderState()', () => {
  it('on 400 generated orders: state, tabs, entered, placed, holding, standing', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const p = await import('@/lib/db/order-predicates')
    const s = await import('@/domains/orders/order-state')
    const { eq, and, sql, gte, lt } = await import('drizzle-orm')
    const now = new Date('2026-11-07T10:00:00Z')
    const at = (h: number) => new Date(now.getTime() + h * 3_600_000)
    const r = rng(7)
    const maybe = (h: number, odds = 0.5) => (r() < odds ? at(h) : null)
    const ROLLBACK = new Error('rollback')
    const taken = new Map<number, boolean>()
    await withTenant(A, async (tx) => {
      for (let i = 0; i < 400; i++) {
        const prepaid = r() < 0.5, packed = maybe(-1, 0.25)
        const [o] = await tx.insert(orders).values({
          tenantId: A, number: 900_000 + i, paymentMethod: prepaid ? 'prepaid' : 'cod', placedAt: at(-48),
          payBy: prepaid ? (r() < 0.5 ? at(1) : at(-1)) : null, paidAt: prepaid ? maybe(-2) : maybe(-2, 0.05), switchedToCodAt: prepaid ? maybe(-3, 0.3) : null,
          confirmedAt: maybe(-4, 0.4), heldAt: maybe(-4, 0.3), packedAt: packed, invoiceNumber: packed ? `PT/26-27/${i}` : null,
          cancelledAt: maybe(-1, 0.15), shippedAt: maybe(0, 0.1), ndrAt: maybe(0, 0.05), deliveredAt: maybe(0, 0.05), lostAt: maybe(0, 0.03), rtoInitiatedAt: maybe(0, 0.04), rtoDeliveredAt: maybe(0, 0.03),
        }).returning({ id: orders.id })
        const isTaken = r() < 0.7; taken.set(900_000 + i, isTaken)
        await tx.insert(orderLines).values({ tenantId: A, orderId: o!.id, title: 'Kurta', qty: 1, unitPrice: 100000, taxableValue: 95238, kind: 'in_stock', stockTakenAt: isTaken ? at(-3) : null })
      }
      const rows = await tx.select({
        ...p.momentColumns, number: orders.number, sqlState: p.stateSql(now),
        toConfirm: sql<boolean>`${p.inTabSql('to_confirm', now)}`, toPack: sql<boolean>`${p.inTabSql('to_pack', now)}`, onHold: sql<boolean>`${p.inTabSql('on_hold', now)}`,
        notPaid: sql<boolean>`${p.inTabSql('not_paid', now)}`, all: sql<boolean>`${p.inTabSql('all', now)}`,
        toShip: sql<boolean>`${p.inTabSql('to_ship', now)}`, onTheWay: sql<boolean>`${p.inTabSql('on_the_way', now)}`,
        couldntDeliver: sql<boolean>`${p.inTabSql('couldnt_deliver', now)}`, comingBack: sql<boolean>`${p.inTabSql('coming_back', now)}`,
        entered: sql<string | null>`${p.enteredAtSql(now)}`, placed: sql<boolean>`${p.placedSql()}`, holding: sql<boolean>`${p.holdingSql(now)}`, standing: sql<boolean>`${p.standingSql()}`,
        useOrder: sql<boolean>`${p.discountUseSql(now, 'both')}`, usePayment: sql<boolean>`${p.discountUseSql(now, 'prepaid')}`, useCod: sql<boolean>`${p.discountUseSql(now, 'cod')}`, method: p.currentMethodSql(), kind: p.paymentKindSql(),
        stage: sql<string>`${p.stageSql()}`,
      }).from(orders).where(and(eq(orders.tenantId, A), gte(orders.number, 900_000), lt(orders.number, 900_400)))
      expect(rows.length).toBe(400)
      const seen = new Set<string>()
      for (const row of rows) {
        // stockShort's own rule, from what was generated: paid, and the in-stock line not taken.
        expect({ number: row.number, stockShort: row.stockShort }).toEqual({ number: row.number, stockShort: !!row.paidAt && !taken.get(row.number) })
        const state = s.orderState(row, now)
        seen.add(state)
        const tab = s.queueTab(state)
        const got = { state: row.sqlState, to_ship: row.toShip, on_the_way: row.onTheWay, couldnt_deliver: row.couldntDeliver, coming_back: row.comingBack, to_confirm: row.toConfirm, to_pack: row.toPack, on_hold: row.onHold, not_paid: row.notPaid, all: row.all, placed: row.placed, holding: row.holding, standing: row.standing, useOrder: row.useOrder, usePayment: row.usePayment, useCod: row.useCod, method: row.method, kind: row.kind }
        const want = { state, to_ship: tab === 'to_ship', on_the_way: tab === 'on_the_way', couldnt_deliver: tab === 'couldnt_deliver', coming_back: tab === 'coming_back', to_confirm: tab === 'to_confirm', to_pack: tab === 'to_pack', on_hold: tab === 'on_hold', not_paid: tab === 'not_paid', all: s.isPlaced(row), placed: s.isPlaced(row),
          holding: s.isHolding(row, now), standing: s.isStanding(row), useOrder: s.usesDiscount(row, 'both', now), usePayment: s.usesDiscount(row, 'prepaid', now), useCod: s.usesDiscount(row, 'cod', now), method: s.currentMethod(row), kind: s.paymentKind(row) }
        expect({ number: row.number, ...got }).toEqual({ number: row.number, ...want })
        // Analytics' stage (A·1), straight from the outcome columns, agrees with the state for every order not cancelled.
        if (state !== 'cancelled') {
          const stage = state === 'delivered' ? 'delivered' : state === 'rto' || state === 'rto_received' ? 'rto' : state === 'lost' ? 'lost' : state === 'shipped' || state === 'ndr' ? 'on_the_way' : 'not_sent'
          expect({ number: row.number, stage: row.stage }).toEqual({ number: row.number, stage })
        }
        // enteredAt (U·4): the same moment, to the millisecond.
        expect({ number: row.number, entered: row.entered ? new Date(row.entered).getTime() : null }).toEqual({ number: row.number, entered: s.enteredAt(row, now)?.getTime() ?? null })
      }
      // The generator reached every state, so every SQL branch was compared.
      expect([...seen].sort()).toEqual([...s.ORDER_STATES].sort())
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
  it('billableAtSql matches billableAt() on 300 generated outcomes', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const p = await import('@/lib/db/order-predicates')
    const { billableAt } = await import('@/domains/orders/outcomes')
    const { eq, and, sql, gte, lt } = await import('drizzle-orm')
    const now = new Date('2026-11-07T10:00:00Z')
    const day = (d: number) => new Date(now.getTime() + d * 86_400_000)
    const r = rng(11)
    const maybe = (d: number, odds: number) => (r() < odds ? day(d) : null)
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      for (let i = 0; i < 300; i++) {
        // Shipped 45 or 10 days ago (or never); delivered before or after the 30-day mark, so least() is exercised.
        const shipped = r() < 0.85 ? day(r() < 0.5 ? -45 : -10) : null
        await tx.insert(orders).values({
          tenantId: A, number: 910_000 + i, paymentMethod: 'cod', placedAt: day(-50), confirmedAt: day(-49), packedAt: day(-48), invoiceNumber: `PB/26-27/${i}`,
          shippedAt: shipped, deliveredAt: maybe(r() < 0.5 ? -20 : -2, 0.5), lostAt: maybe(-1, 0.15), rtoInitiatedAt: maybe(-1, 0.1),
        })
      }
      const rows = await tx.select({ number: orders.number, shippedAt: orders.shippedAt, deliveredAt: orders.deliveredAt, lostAt: orders.lostAt, rtoInitiatedAt: orders.rtoInitiatedAt,
        at: sql<string | null>`${p.billableAtSql()}` })
        .from(orders).where(and(eq(orders.tenantId, A), gte(orders.number, 910_000), lt(orders.number, 910_300)))
      expect(rows.length).toBe(300)
      const kinds = new Set<string>()
      for (const row of rows) {
        const want = billableAt(row)
        kinds.add(want === null ? 'null' : row.deliveredAt && want.getTime() === row.deliveredAt.getTime() ? 'delivered' : 'assumed')
        expect({ number: row.number, at: row.at ? new Date(row.at).getTime() : null }).toEqual({ number: row.number, at: want?.getTime() ?? null })
      }
      expect([...kinds].sort()).toEqual(['assumed', 'delivered', 'null'])
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
