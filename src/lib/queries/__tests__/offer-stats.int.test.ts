// Offers O·3 on a real Postgres: offerStats (the one computation of "did it make money?") on orders in every state
// that matters, a creator code reached by link and by typing, and a code leaking onto a coupon site. Tenant A of the
// proof (scripts/verify/tenancy.sh); skipped unless INT_DB_HOST is set. Everything is written in one transaction
// that is rolled back, at a `now` in 2031 so no other test's order falls in the window.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const ME = '99999999-9999-9999-9999-999999999999'

describe.skipIf(!host)('offerStats', () => {
  it('counts what each offer and creator code brought, by state, method, buyer and route', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, shipments } = await import('@/lib/db/schema-orders')
    const { shopSettings } = await import('@/lib/db/schema')
    const { discounts, discountCodes, orderDiscounts } = await import('@/lib/db/schema-discounts')
    const { offerStatsIn } = await import('@/lib/queries/discounts')
    const { priorOrderSql } = await import('@/lib/db/order-predicates')
    const { eq, sql } = await import('drizzle-orm')
    const now = new Date('2031-03-01T10:00:00Z')
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    const ROLLBACK = new Error('rollback')
    let n = 960_000
    await withTenant(A, async (tx) => {
      const offer = async (title: string) => (await tx.insert(discounts).values({ tenantId: A, title, style: 'order_off', percentBps: 1000, startsAt: ago(90), startedAt: ago(90), startedBy: ME, createdBy: ME })
        .returning({ id: discounts.id }))[0]!.id
      const D = await offer('Stats'), L = await offer('Leaky')
      const code = async (d: string, c: string, made: Date) => (await tx.insert(discountCodes).values({ tenantId: A, discountId: d, code: c, label: c, createdAt: made }).returning({ id: discountCodes.id }))[0]!.id
      const RIYA = await code(D, `RIYA${n}`, ago(60)), LEAK = await code(L, `LEAK${n}`, ago(60))
      type O = { at: Date; phone: string; method?: 'cod' | 'prepaid'; subtotal?: number; paid?: boolean; payBy?: Date; delivered?: boolean; rto?: boolean; cancelled?: boolean; costs?: { cogs: number; forwardShipping: number } }
      const order = async (o: O, use?: { d: string; amount: number; code?: string; via?: 'auto' | 'typed' | 'link' }) => {
        const subtotal = o.subtotal ?? 200000, discount = use?.amount ?? 0
        const [r] = await tx.insert(orders).values({
          tenantId: A, number: n++, paymentMethod: o.method ?? 'cod', placedAt: o.at, phone: o.phone, subtotal, discount, total: subtotal - discount, pricesIncludeGst: true,
          payBy: o.payBy ?? null, paidAt: o.paid ? o.at : null, shippedAt: o.delivered || o.rto ? o.at : null, deliveredAt: o.delivered ? o.at : null,
          rtoInitiatedAt: o.rto ? o.at : null, cancelledAt: o.cancelled ? o.at : null, merchandiseNet: subtotal - discount, ...o.costs,
        }).returning({ id: orders.id })
        if (use) await tx.insert(orderDiscounts).values({ tenantId: A, orderId: r!.id, discountId: use.d, codeId: use.code ?? null, class: 'order', amount: use.amount,
          title: 'x', style: 'order_off', percentBps: 1000, minSubtotal: 0, via: use.via ?? 'auto' })
        return r!.id
      }
      // Offer D in the window: delivered by link (new buyer), paid online and delivered by a typed code (a repeat buyer:
      // the same phone ordered 60 days ago), returned (RTO), and two that use nothing now (cancelled; online, abandoned).
      await order({ at: ago(60), phone: '9829000002' })
      const first = await order({ at: ago(3), phone: '9829000001', delivered: true, costs: { cogs: 80000, forwardShipping: 6000 } }, { d: D, amount: 20000, code: RIYA, via: 'link' })
      await order({ at: ago(4), phone: '9829000002', method: 'prepaid', paid: true, delivered: true, subtotal: 300000 }, { d: D, amount: 30000, code: RIYA, via: 'typed' })
      await order({ at: ago(5), phone: '9829000003', rto: true }, { d: D, amount: 10000 })
      await order({ at: ago(6), phone: '9829000004', cancelled: true }, { d: D, amount: 10000 })
      await order({ at: ago(7), phone: '9829000005', method: 'prepaid', payBy: ago(6) }, { d: D, amount: 10000 })
      // Outside the window: not counted.
      await order({ at: ago(40), phone: '9829000006', delivered: true }, { d: D, amount: 10000 })
      // Without an offer, in the window: one delivered, one returned.
      await order({ at: ago(2), phone: '9829000007', delivered: true, subtotal: 100000 })
      await order({ at: ago(2), phone: '9829000008', rto: true, subtotal: 140000 })
      // A code on a coupon site: 3 uses a week by link for the 28 days before, then 12 this week, 10 of them typed.
      for (let i = 0; i < 12; i++) await order({ at: ago(1 + (i % 6)), phone: `98291000${String(i).padStart(2, '0')}` }, { d: L, amount: 1000, code: LEAK, via: i < 10 ? 'typed' : 'link' })
      for (let i = 0; i < 12; i++) await order({ at: ago(8 + i * 2), phone: `98292000${String(i).padStart(2, '0')}` }, { d: L, amount: 1000, code: LEAK, via: 'link' })

      const s = await offerStatsIn(tx, A, now)
      const d = s.offers.get(D)!
      expect({ orders: d.orders, given: d.given, aov: d.aov, prepaid: d.prepaid, repeat: d.repeat, fresh: d.fresh, delivered: d.delivered, rto: d.rto, givenPerDelivered: d.givenPerDelivered })
        .toEqual({ orders: 3, given: 60000, aov: Math.round((180000 + 270000 + 190000) / 3), prepaid: 1, repeat: 1, fresh: 2, delivered: 2, rto: 1, givenPerDelivered: 30000 })
      // ₹ kept per delivered order (profit.ts): the delivered order with known costs only (the other's cogs is unknown).
      // Its freight goes through freight.ts (Ship S0·6). Shipped another way and no confirmed estimate yet: freight left
      // out and said so — ₹1,800 net − ₹800 cogs − the plan's 2% on ₹1,800 merchandise (₹36) = ₹964, before shipping costs.
      expect({ kept: d.keptPerDelivered, basis: d.keptBasis }).toEqual({ kept: 180000 - 80000 - 3600, basis: 'none' })
      // The shop confirms ₹70 a delivery, ₹70 a return, ₹36 COD fee: estimated (a COD delivery pays the fee).
      await tx.update(shopSettings).set({ shipCostDelivery: 7000, shipCostReturn: 7000, shipCostCod: 3600, shipCostsConfirmedAt: now }).where(eq(shopSettings.tenantId, A))
      const est = (await offerStatsIn(tx, A, now)).offers.get(D)!
      expect({ kept: est.keptPerDelivered, basis: est.keptBasis }).toEqual({ kept: 180000 - 80000 - 7000 - 3600 - 3600, basis: 'estimate' })
      // Shipped with Shiprocket: its ₹60 forward line is recorded but the COD fee line is not: pending, left out (never ₹0).
      await tx.insert(shipments).values({ tenantId: A, orderId: first, provider: 'shiprocket' })
      const pend = (await offerStatsIn(tx, A, now)).offers.get(D)!
      expect({ kept: pend.keptPerDelivered, basis: pend.keptBasis }).toEqual({ kept: null, basis: null })
      // The ₹30 COD fee line arrives: actual.
      await tx.update(orders).set({ courierCodFee: 3000 }).where(eq(orders.id, first))
      const act = (await offerStatsIn(tx, A, now)).offers.get(D)!
      expect({ kept: act.keptPerDelivered, basis: act.keptBasis }).toEqual({ kept: 180000 - 80000 - 6000 - 3000 - 3600, basis: 'actual' })
      const riya = d.creators.find((c) => c.id === RIYA)!
      expect({ orders: riya.orders, delivered: riya.delivered, rto: riya.rto, given: riya.given, viaLink: riya.viaLink, leak: riya.leak })
        .toEqual({ orders: 2, delivered: 2, rto: 0, given: 50000, viaLink: 1, leak: null })
      const leak = s.offers.get(L)!.creators[0]!
      expect(leak.id).toBe(LEAK)
      expect(leak.leak?.reasons).toEqual(['typed', 'spike']) // 10 of 12 typed; 12 this week against ~3 a week
      // The window's orders: every order using an offer now (an order counts once), and the rest.
      expect({ orders: s.all.orders, delivered: s.all.delivered, given: s.all.given }).toEqual({ orders: 3 + 24, delivered: 2, given: 60000 + 24 * 1000 })
      expect(s.without).toEqual({ orders: 2, aov: 120000, delivered: 1, rto: 1 })
      // New vs repeat reads the first-order rule: the repeat buyer's phone has ordered here; the new one's had not, before.
      const [had] = await tx.execute<{ before: boolean; ever: boolean }>(sql`select ${priorOrderSql(now, A, '9829000001', { except: first, before: sql`${ago(3).toISOString()}::timestamptz` })} before,
        ${priorOrderSql(now, A, '9829000002')} ever`)
      expect(had).toEqual({ before: false, ever: true })
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
