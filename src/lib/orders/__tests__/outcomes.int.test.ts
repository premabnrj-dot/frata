// A parcel's dates by hand (src/lib/orders/outcomes.ts, Ship S0·4) on a real Postgres: tenant A of the proof. Every
// guard, a double tap, Undo by role and within the month, a return that restocks, and Cancel refused while a
// shipment is booked. Skipped unless INT_DB_HOST is set (CI). Everything it writes is rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const riya = { kind: 'member' as const, userId: '99999999-9999-9999-9999-999999999999', email: 'riya@kesar.test' }

describe.skipIf(!host)('outcomes by hand', () => {
  it('ship, deliver, come back, lose; undo by role, in the month, never after a restock; cancel waits for a booked shipment', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines, shipments } = await import('@/lib/db/schema-orders')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const out = await import('@/lib/orders/outcomes')
    const w = await import('@/lib/orders/work')
    const { orderState } = await import('@/domains/orders/order-state')
    const { momentColumns } = await import('@/lib/db/order-predicates')
    const { and, eq, isNull } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    const now = new Date('2026-11-20T10:00:00.123Z')
    const later = (s: number) => new Date(now.getTime() + s * 1000)
    const owner = { ...riya, role: 'owner' as const }, staff = { ...riya, role: 'staff' as const }
    await withTenant(A, async (tx) => {
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-out-${Date.now()}`, title: 'Int kurta', options: ['Size'], status: 'active' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 100000, stock: 0 }).returning({ id: variants.id })
      let n = 0
      const packed = async () => {
        const [r] = await tx.insert(orders).values({ tenantId: A, number: 930_000 + Math.floor(Math.random() * 9_000) + n++, paymentMethod: 'cod', placedAt: now, confirmedAt: now, packedAt: now,
          invoiceNumber: `OUT/${n}/${Date.now() % 1e6}`, subtotal: 100000, total: 100000 }).returning({ id: orders.id })
        await tx.insert(orderLines).values({ tenantId: A, orderId: r!.id, variantId: v!.id, title: 'M', qty: 1, unitPrice: 100000, taxableValue: 95238, kind: 'in_stock', stockTakenAt: now })
        return r!.id
      }
      const state = async (id: string) => orderState((await tx.select(momentColumns).from(orders).where(and(eq(orders.tenantId, A), eq(orders.id, id))))[0]!, later(3600))
      const stock = async () => (await tx.select({ s: variants.stock }).from(variants).where(eq(variants.id, v!.id)))[0]!.s
      const ev = (r: { ok: boolean }) => (r as unknown as { eventId: string }).eventId

      // Ship it yourself; a second tap is refused; outcomes before shipping are refused.
      const a = await packed()
      expect(await out.markDelivered(tx, { tenantId: A, actor: riya, orderId: a, now: later(1) })).toMatchObject({ ok: false, error: 'Mark it shipped first.' })
      const shipped = await out.markShipped(tx, { tenantId: A, actor: riya, orderId: a, courierName: ' Professional Couriers ', now: later(2) })
      expect(shipped.ok).toBe(true)
      expect(await state(a)).toBe('shipped')
      expect((await out.markShipped(tx, { tenantId: A, actor: riya, orderId: a, now: later(3) })).ok).toBe(false)
      const [s] = await tx.select({ provider: shipments.provider, courier: shipments.courierName }).from(shipments).where(and(eq(shipments.tenantId, A), eq(shipments.orderId, a), isNull(shipments.endedAt)))
      expect(s).toEqual({ provider: 'self', courier: 'Professional Couriers' })

      // Delivered once; staff can't undo it; the owner can, this month; then it can be delivered again.
      const del = await out.markDelivered(tx, { tenantId: A, actor: riya, orderId: a, now: later(4) })
      expect(await state(a)).toBe('delivered')
      expect((await out.markDelivered(tx, { tenantId: A, actor: riya, orderId: a, now: later(5) })).ok).toBe(false)
      expect(await out.undoOutcome(tx, A, staff, ev(del), later(6))).toMatchObject({ ok: false, error: 'Only an owner or admin can undo that.' })
      expect(await w.undo(tx, A, riya, ev(del), later(6))).toMatchObject({ ok: false, error: 'There is nothing to undo.' }) // the general Undo never undoes an outcome
      expect((await out.undoOutcome(tx, A, owner, ev(del), later(7))).ok).toBe(true)
      expect(await state(a)).toBe('shipped')
      const del2 = await out.markDelivered(tx, { tenantId: A, actor: riya, orderId: a, now: later(8) })
      // Next month the delivery is billed: no undo.
      expect(await out.undoOutcome(tx, A, owner, ev(del2), new Date('2026-12-01T00:00:00Z'))).toMatchObject({ ok: false, error: 'That month is closed: it cannot be undone now.' })

      // Undo Shipped ends the self shipment, so the order ships again; staff may undo a Shipped (they ship).
      const b = await packed()
      const sh = await out.markShipped(tx, { tenantId: A, actor: riya, orderId: b, now: later(10) })
      expect((await out.undoOutcome(tx, A, staff, ev(sh), later(11))).ok).toBe(true)
      expect(await state(b)).toBe('packed')
      const sh2 = await out.markShipped(tx, { tenantId: A, actor: riya, orderId: b, now: later(12) })
      expect(sh2.ok).toBe(true)
      // 30 days on it counts as delivered: un-shipping it would restart the billing clock, so Undo is refused.
      expect(await out.undoOutcome(tx, A, owner, ev(sh2), later(12 + 30 * 86_400))).toMatchObject({ ok: false, error: 'That month is closed: it cannot be undone now.' })

      // Came back with the stock put back: once; undo refused. Without it: undo puts it back on the way.
      const c = await packed()
      await out.markShipped(tx, { tenantId: A, actor: riya, orderId: c, now: later(20) })
      const before = await stock()
      const back = await out.markCameBack(tx, { tenantId: A, actor: riya, orderId: c, restock: true, now: later(21) })
      expect(await state(c)).toBe('rto_received')
      expect(await stock()).toBe(before + 1)
      expect(await out.undoOutcome(tx, A, owner, ev(back), later(22))).toMatchObject({ ok: false })
      const d = await packed()
      await out.markShipped(tx, { tenantId: A, actor: riya, orderId: d, now: later(30) })
      const back2 = await out.markCameBack(tx, { tenantId: A, actor: riya, orderId: d, restock: false, now: later(31) })
      expect(await stock()).toBe(before + 1)
      expect((await out.undoOutcome(tx, A, owner, ev(back2), later(32))).ok).toBe(true)
      expect(await state(d)).toBe('shipped')

      // Lost by the courier: an outcome; nothing else after it.
      const lost = await out.markLost(tx, { tenantId: A, actor: riya, orderId: d, now: later(40) })
      expect(lost.ok).toBe(true)
      expect(await state(d)).toBe('lost')
      expect((await out.markDelivered(tx, { tenantId: A, actor: riya, orderId: d, now: later(41) })).ok).toBe(false)

      // A shipment booked with a courier but not picked up: Cancel waits for it; a Shiprocket parcel is never marked by hand.
      const e = await packed()
      await tx.insert(shipments).values({ tenantId: A, orderId: e, provider: 'shiprocket' })
      expect(await w.cancel(tx, A, riya, e, { reason: 'customer_cancelled', restock: false }, later(50))).toMatchObject({ ok: false, error: 'A shipment is booked for it: cancel the shipment first.' })
      expect((await out.markShipped(tx, { tenantId: A, actor: riya, orderId: e, now: later(51) })).ok).toBe(false)
      throw ROLLBACK
    }).catch((err) => { if (err !== ROLLBACK) throw err })
  })
})
