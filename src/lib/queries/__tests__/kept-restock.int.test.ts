// A return that was NOT put back in stock loses its goods' cost in ₹ kept (2026-11-12), on a real Postgres: two
// orders come back by hand (markCameBack), one with its stock put back and one without; keptSql (Offers) and
// Analytics read the came-back event the same way (rtoRestockedSql) and agree. Tenant A of the proof, rolled back.
// A delivered order with pieces returned: the fee follows what was kept in both. Skipped unless INT_DB_HOST is set (CI).
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const riya = { kind: 'member' as const, userId: '99999999-9999-9999-9999-999999999999', email: 'riya@kesar.test' }

describe.skipIf(!host)('₹ kept: a return keeps its cost only when its stock went back', () => {
  it('restocked: freight only; not restocked: freight and the goods; keptSql and Analytics agree', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { shopSettings } = await import('@/lib/db/schema')
    const { keptSql, rtoRestockedSql } = await import('@/lib/db/order-predicates')
    const { keptOf } = await import('@/domains/orders/kept')
    const out = await import('@/lib/orders/outcomes')
    const q = await import('@/lib/queries/analytics')
    const { eq, sql } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    // A window no other test writes in, so Analytics' change is these orders alone.
    const now = new Date('2032-05-01T10:00:00Z')
    const at = (s: number) => new Date(now.getTime() - 3_600_000 + s * 1000)
    const est = { delivery: 7000, ret: 7000, codFee: 3600 }
    let n = 940_000 + Math.floor(Math.random() * 9_000)

    await withTenant(A, async (tx) => {
      await tx.update(shopSettings).set({ shipCostDelivery: est.delivery, shipCostReturn: est.ret, shipCostCod: est.codFee, shipCostsConfirmedAt: now }).where(eq(shopSettings.tenantId, A))
      const base = await q.analyticsIn(tx, A, 'owner', 30, now)
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-kept-${Date.now()}`, title: 'Int kurta', options: ['Size'], status: 'active' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 100000, stock: 0 }).returning({ id: variants.id })
      const cameBack = async (restock: boolean, cogs: number | null) => {
        const [r] = await tx.insert(orders).values({ tenantId: A, number: n++, paymentMethod: 'cod', placedAt: at(0), confirmedAt: at(0), packedAt: at(0), invoiceNumber: `K/${n % 1e5}/${Date.now() % 1e5}`,
          subtotal: 100000, total: 100000, merchandiseNet: 95238, cogs }).returning({ id: orders.id })
        await tx.insert(orderLines).values({ tenantId: A, orderId: r!.id, variantId: v!.id, title: 'M', qty: 1, unitPrice: 100000, taxableValue: 95238, unitCost: cogs, kind: 'in_stock', stockTakenAt: at(0) })
        expect((await out.markShipped(tx, { tenantId: A, actor: riya, orderId: r!.id, now: at(1) })).ok).toBe(true)
        expect((await out.markCameBack(tx, { tenantId: A, actor: riya, orderId: r!.id, restock, now: at(2) })).ok).toBe(true)
        return r!.id
      }
      const back = await cameBack(true, 40000)
      const lost = await cameBack(false, 40000)
      const unknown = await cameBack(false, null) // not put back and its cost unknown: left out, never ₹0
      const backUnknown = await cameBack(true, null) // put back: its cost is not needed

      const flag = async (id: string) => (await tx.execute<{ v: boolean }>(sql`select ${rtoRestockedSql('o')} v from orders o where o.tenant_id = ${A} and o.id = ${id}`))[0]!.v
      expect([await flag(back), await flag(lost), await flag(unknown), await flag(backUnknown)]).toEqual([true, false, false, true])

      // Offers' read (keptSql) over exactly these orders.
      const k = keptSql(now, 'o', [])
      const rows = await tx.execute(sql`select ${k.columns} from orders o where o.tenant_id = ${A} and o.id in (${back}, ${lost}, ${unknown}, ${backUnknown}) and ${k.where} group by ${k.groupBy()}`)
      const groups = (rows as unknown as Record<string, unknown>[]).map((r) => ({
        outcome: r.outcome as 'rto', n: Number(r.n), provider: r.provider as 'self', cod: !!r.cod, restocked: !!r.restocked, net: Number(r.net),
        cogs: r.cogs === null ? null : Number(r.cogs), forward: null, rto: null, courierCodFee: null, gateway: Number(r.gw), base: Number(r.base), feeBps: null,
      }))
      const kept = keptOf(groups, est)
      // Each return: 70 + 70 freight (no COD fee on an estimated return); the one not put back also its ₹400 goods.
      expect(kept.rto).toEqual({ n: 3, kept: -(3 * 14000 + 40000) })
      expect(kept.leftOut).toBe(1)

      // Analytics reads the same rule: its window changed by exactly these orders.
      const after = await q.analyticsIn(tx, A, 'owner', 30, now)
      expect(after.cur.kept!.rto.kept - (base.cur.kept?.rto.kept ?? 0)).toBe(kept.rto.kept)
      expect(after.cur.kept!.leftOut - (base.cur.kept?.leftOut ?? 0)).toBe(1)
      throw ROLLBACK
    }).catch((err) => { if (err !== ROLLBACK) throw err })
  })

  it('a delivered order with pieces returned: Frrata\'s fee is on what was kept, in Analytics as in Offers (impact review 2026-11-12)', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, creditNotes } = await import('@/lib/db/schema-orders')
    const { keptSql } = await import('@/lib/db/order-predicates')
    const q = await import('@/lib/queries/analytics')
    const { sql } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    const now = new Date('2032-07-01T10:00:00Z')
    const at = (h: number) => new Date(now.getTime() - 48 * 3_600_000 + h * 3_600_000)
    const n = 950_000 + Math.floor(Math.random() * 9_000)
    await withTenant(A, async (tx) => {
      const [o] = await tx.insert(orders).values({ tenantId: A, number: n, paymentMethod: 'cod', placedAt: at(0), confirmedAt: at(0), packedAt: at(0), shippedAt: at(1), deliveredAt: at(2),
        invoiceNumber: `KR/${n}`, subtotal: 100000, total: 100000, gstTotal: 4762, merchandiseNet: 95238, cogs: 40000 }).returning({ id: orders.id })
      const base = async () => {
        const k = keptSql(now, 'o', [])
        const [r] = await tx.execute<{ base: string }>(sql`select ${k.columns} from orders o where o.tenant_id = ${A} and o.id = ${o!.id} and ${k.where} group by ${k.groupBy()}`)
        return Number(r!.base)
      }
      const before = await q.analyticsIn(tx, A, 'owner', 30, now)
      expect(await base()).toBe(95238)
      // Half came back on a return note, inside the window.
      await tx.insert(creditNotes).values({ tenantId: A, orderId: o!.id, number: `KR/CN/${n}`, againstInvoice: `KR/${n}`, reason: 'returned', kind: 'return',
        taxable: 47619, cgst: 0, sgst: 0, igst: 0, total: 47619, issuedAt: at(3), issuedBy: riya.userId })
      expect(await base()).toBe(47619)
      const after = await q.analyticsIn(tx, A, 'owner', 30, now)
      // ₹ kept fell by the ₹476.19 credited, less the fee no longer charged on it: 2% of ₹952.38 → 2% of ₹476.19 (₹9.52
      // back). Before the fix Analytics kept charging the fee on the returned half: the drop was the whole ₹476.19.
      // Tenant A of the proof is on a 2% plan.
      const { deliveredFee } = await import('@/domains/plans/entitlements')
      const { paise } = await import('@/domains/money/paise')
      const delta = after.cur.kept!.delivered.kept - (before.cur.kept?.delivered.kept ?? 0)
      expect(delta).toBe(-47619 + Number(deliveredFee(paise(95238), 200)) - Number(deliveredFee(paise(47619), 200)))
      throw ROLLBACK
    }).catch((err) => { if (err !== ROLLBACK) throw err })
  })
})
