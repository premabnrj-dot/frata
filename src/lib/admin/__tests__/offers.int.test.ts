// Admin › Offers against a real Postgres with the real roles (offers O·4). Skipped unless INT_DB_HOST is set (CI).
// Works on shop B of the proof (the offers int tests use A). It commits, and ends every offer it made.
//  - a stop takes the offer out of the quote, the typed code and the bar at once; the shop sees it stopped, with why;
//  - a resume brings it back, unless the shop already runs MAX_RUNNING_OFFERS (counted under the shop's offers lock);
//  - the platform totals (a definer, aggregates only) agree with discountUses, the app's own count.
import { beforeAll, describe, expect, it } from 'vitest'

const HOST = 'kesar-studio.frata.test' // COD only here: the host need not be approved in Razorpay (D1·8)

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const B = '22222222-2222-2222-2222-222222222222'
const ME = '99999999-9999-9999-9999-999999999999'
const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const, sessionId: '00000000-0000-4000-8000-000000000000', confirmedAt: new Date() }

describe.skipIf(!host)('Admin › Offers: the kill switch and the totals', () => {
  let admin: typeof import('../offers')
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    admin = await import('../offers')
  })

  it('a stop drops the offer from the quote, the code and the bar; resume brings it back within the limit', async () => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { discounts, discountCodes, orderDiscounts } = await import('@/lib/db/schema-discounts')
    const { orders } = await import('@/lib/db/schema-orders')
    const { quoteData, codeFor } = await import('@/lib/queries/checkout')
    const { listOffers } = await import('@/lib/queries/discounts')
    const { discountUses, runningOffers } = await import('@/lib/db/discount-predicates')
    const { MAX_RUNNING_OFFERS } = await import('@/domains/checkout/offer-form')
    const { offerStatus } = await import('@/domains/checkout/offer-status')
    const { and, eq, inArray, isNull } = await import('drizzle-orm')
    const stamp = String(Date.now()).slice(-8)
    const made: string[] = []
    const start = async (title: string, extra: Partial<typeof discounts.$inferInsert> = {}) => withTenant(B, async (tx) => {
      const [d] = await tx.insert(discounts).values({ tenantId: B, title, style: 'order_off', percentBps: 1000, startsAt: new Date(Date.now() - 60_000), startedAt: new Date(), startedBy: ME, createdBy: ME, ...extra })
        .returning({ id: discounts.id })
      made.push(d!.id); return d!.id
    })
    try {
      await withTenant(B, (tx) => tx.update(discounts).set({ announce: false }).where(and(eq(discounts.tenantId, B), eq(discounts.announce, true))))
      const D = await start('Kill switch', { announce: true })
      await withTenant(B, (tx) => tx.insert(discountCodes).values({ tenantId: B, discountId: D, code: `STOP${stamp}` }))
      const seen = async () => {
        const now = new Date()
        const q = await quoteData(B, [], now, null, HOST)
        const code = await withTenant(B, (tx) => codeFor(tx, B, `stop${stamp}`, now))
        const row = (await listOffers(B, now, D))[0]!
        return { quoted: q.offers.some((o) => o.id === D), code: code?.discountId === D, bar: row.announce && offerStatus(row, now) === 'live', status: row.status, why: row.stopReason }
      }
      expect(await seen()).toEqual({ quoted: true, code: true, bar: true, status: 'live', why: null })

      expect(await admin.stopOffer(staff, B, D, 'The struck price was never charged')).toBe(true)
      expect(await admin.stopOffer(staff, B, D, 'Again')).toBe(false) // already stopped: nothing changes
      expect(await seen()).toEqual({ quoted: false, code: false, bar: false, status: 'stopped', why: 'The struck price was never charged' })
      const listed = await admin.shopOffersForAdmin(staff, B, new Date())
      expect(listed!.offers.find((o) => o.id === D)).toMatchObject({ status: 'stopped', stopReason: 'The struck price was never charged' })

      // Fill the shop to the limit while it is stopped: resuming it would make 21, so it waits.
      const running = await withTenant(B, (tx) => runningOffers(tx, B, new Date()))
      for (let i = running; i < MAX_RUNNING_OFFERS; i++) await start(`Filler ${i}`)
      expect(await admin.resumeOffer(staff, B, D)).toBe('full')
      await withTenant(B, (tx) => tx.update(discounts).set({ endedAt: new Date() }).where(and(eq(discounts.tenantId, B), eq(discounts.title, `Filler ${MAX_RUNNING_OFFERS - 1}`), isNull(discounts.endedAt))))
      expect(await admin.resumeOffer(staff, B, D)).toBe('resumed')
      expect(await seen()).toEqual({ quoted: true, code: true, bar: true, status: 'live', why: null })
      expect(await admin.resumeOffer(staff, B, D)).toBe('none')

      // The totals agree with the app's own count of uses, on one order per branch of the use rule: a payment saving
      // on a paid order (counts), on one switched to COD (not), an order saving on a cancelled order (not), both on an
      // order still holding its stock (count), and one whose payment window ran out (not).
      const P = await start('Pay online', { style: 'pay_online', percentBps: null, amountOff: 5000 })
      await withTenant(B, async (tx) => {
        const at = (m: number) => new Date(Date.now() + m * 60_000)
        const order = async (o: Partial<typeof orders.$inferInsert>) => (await tx.insert(orders).values({ tenantId: B, number: 990_000 + Math.floor(Math.random() * 9_000), paymentMethod: 'prepaid',
          placedAt: at(-30), phone: '9829444000', subtotal: 100000, discount: 0, total: 100000, pricesIncludeGst: true, ...o }).returning({ id: orders.id }))[0]!.id
        const use = (orderId: string, discountId: string, cls: 'order' | 'payment', amount: number) =>
          tx.insert(orderDiscounts).values({ tenantId: B, orderId, discountId, class: cls, amount, title: 'x', style: 'order_off', minSubtotal: 0 })
        await use(await order({ paidAt: at(-20) }), P, 'payment', 5000)
        await use(await order({ switchedToCodAt: at(-20) }), P, 'payment', 5000)
        await use(await order({ paymentMethod: 'cod', cancelledAt: at(-10) }), D, 'order', 7000)
        const holding = await order({ payBy: at(20) }); await use(holding, D, 'order', 7000); await use(holding, P, 'payment', 5000)
        await use(await order({ payBy: at(-5) }), D, 'order', 7000)
      })
      const ids = await withTenant(B, async (tx) => (await tx.select({ id: discounts.id }).from(discounts).where(eq(discounts.tenantId, B))).map((r) => r.id))
      const uses = await withTenant(B, (tx) => discountUses(tx, B, ids, new Date()))
      const given = [...uses.values()].reduce((a, u) => a + u.given, 0)
      const totals = await admin.offerTotalsForAdmin(staff, new Date(), new Date(0))
      const b = totals.find((t) => t.tenantId === B)
      expect(b?.given ?? 0).toBe(given)
      expect(b?.live).toBeGreaterThanOrEqual(MAX_RUNNING_OFFERS - 1)
    } finally {
      await withTenant(B, (tx) => tx.update(discounts).set({ endedAt: new Date(), announce: false }).where(and(eq(discounts.tenantId, B), inArray(discounts.id, made), isNull(discounts.endedAt))))
    }
  })
})
