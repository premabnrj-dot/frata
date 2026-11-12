// What may happen to an offer, on a real Postgres (offers O·4 impact review): every refusal of lib/offers/steps.ts,
// the 20-running limit, and a payment retry's re-check of its offers (payment.ts offersStillFit: still live, still the
// phone's first order). Tenant A of the proof; skipped unless INT_DB_HOST is set. One transaction, rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const ME = '99999999-9999-9999-9999-999999999999'

describe.skipIf(!host)('offer steps and a retry', () => {
  it('a stopped offer only ends; ended never changes; the limit holds a start and a lapsed offer; a retry re-checks its offers', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { discounts, orderDiscounts } = await import('@/lib/db/schema-discounts')
    const { orders } = await import('@/lib/db/schema-orders')
    const S = await import('@/lib/offers/steps')
    const { runningOffers } = await import('@/lib/db/discount-predicates')
    const { MAX_RUNNING_OFFERS, RUNNING_FULL } = await import('@/domains/checkout/offer-form')
    const { offersStillFit } = await import('@/lib/orders/payment')
    const { eq } = await import('drizzle-orm')
    const now = new Date()
    const ago = (m: number) => new Date(now.getTime() - m * 60_000)
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      const offer = async (o: Partial<typeof discounts.$inferInsert> = {}) => (await tx.insert(discounts).values({ tenantId: A, title: 'Step', style: 'order_off', percentBps: 1000, startsAt: ago(600), createdBy: ME, ...o })
        .returning({ id: discounts.id }))[0]!.id
      const started = { startedAt: ago(500), startedBy: ME }
      const edit = (id: string, c: Partial<{ manager: boolean; style: string; endsAt: Date | null }> = {}) => S.editRefusal(tx, A, id, { manager: true, style: 'order_off', endsAt: null, ...c }, now)

      // A draft starts, pauses and resumes; a partner may edit a draft but not a started offer; the style never changes.
      const D = await offer()
      expect(await edit(D, { manager: false })).toBeNull()
      expect(await S.stepOfferIn(tx, A, ME, D, 'start', now)).toBe('done')
      expect(await edit(D, { manager: false })).toBe('Only an owner or admin can change an offer that has started.')
      expect(await edit(D, { style: 'free_shipping' })).toBe('The style of an offer does not change. Make a new one.')
      expect(await S.stepOfferIn(tx, A, ME, D, 'pause', now)).toBe('done')
      expect(await S.stepOfferIn(tx, A, ME, D, 'pause', now)).toBe('none')
      expect(await S.stepOfferIn(tx, A, ME, D, 'resume', now)).toBe('done')

      // Stopped by Frrata: frozen for the shop — no edit, pause, resume or code — but End works.
      const X = await offer({ ...started, stoppedAt: ago(5), stoppedBy: ME, stopReason: 'Proof stop' })
      expect(await edit(X)).toBe(S.STOPPED)
      expect(await S.stepOfferIn(tx, A, ME, X, 'pause', now)).toBe('none')
      expect(await S.stepOfferIn(tx, A, ME, X, 'resume', now)).toBe('none')
      expect(await S.codeRefusal(tx, A, X)).toBe(true)
      expect(await S.stepOfferIn(tx, A, ME, X, 'end', now)).toBe('done')
      expect(await edit(X)).toBe('An ended offer does not change. Duplicate it to run it again.')
      expect(await S.stepOfferIn(tx, A, ME, X, 'end', now)).toBe('none')
      expect(await S.codeRefusal(tx, A, D)).toBe(false)

      // The limit: fill past it (a margin for other tests' offers in A), then a start and a lapsed offer's new end wait.
      for (let n = await runningOffers(tx, A, now); n < MAX_RUNNING_OFFERS + 3; n++) await offer({ ...started, title: 'Filler' })
      const W = await offer()
      expect(await S.stepOfferIn(tx, A, ME, W, 'start', now)).toBe('full')
      const L = await offer({ ...started, startsAt: ago(600), endsAt: ago(60) })
      expect(await edit(L, { endsAt: new Date(now.getTime() + 86_400_000) })).toBe(RUNNING_FULL)
      expect(await edit(L, { endsAt: null })).toBe(RUNNING_FULL)
      expect(await edit(L, { endsAt: ago(30) })).toBeNull() // still lapsed: not running, nothing to count

      // A retry after the hold ran out: the first-order offer is still this phone's first — until the phone orders again.
      const F = await offer({ ...started, firstOrder: true })
      const order = async (phone: string, o: Partial<typeof orders.$inferInsert> = {}) => (await tx.insert(orders).values({ tenantId: A, number: 980_000 + Math.floor(Math.random() * 10_000), paymentMethod: 'prepaid',
        placedAt: ago(40), payBy: ago(10), phone, subtotal: 100000, discount: 10000, total: 90000, pricesIncludeGst: true, ...o }).returning({ id: orders.id }))[0]!.id
      const use = (orderId: string, discountId: string) => tx.insert(orderDiscounts).values({ tenantId: A, orderId, discountId, class: 'order', amount: 10000, title: 'x', style: 'order_off', percentBps: 1000, minSubtotal: 0 })
      const O1 = await order('9829333001'); await use(O1, F)
      expect(await offersStillFit(tx, A, O1, '9829333001', now)).toBe(true)
      await order('9829333001', { paymentMethod: 'cod', payBy: null, placedAt: ago(5) })
      expect(await offersStillFit(tx, A, O1, '9829333001', now)).toBe(false)
      // …and every offer on it is still live: one paused (or ended, or stopped by Frrata) meanwhile sends the shopper back.
      const T = await offer({ ...started })
      const O2 = await order('9829333002'); await use(O2, T)
      expect(await offersStillFit(tx, A, O2, '9829333002', now)).toBe(true)
      await tx.update(discounts).set({ pausedAt: now }).where(eq(discounts.id, T))
      expect(await offersStillFit(tx, A, O2, '9829333002', now)).toBe(false)
      // Each way of paying checks only its own offers (offers per method, 0106; security review 2026-11-11 MED-1: a
      // switch to COD after the hold now checks too): a COD-only order offer stopped meanwhile refuses Pay on delivery,
      // never a retry online; a pay-online saving stopped meanwhile refuses a retry online, never Pay on delivery.
      const C = await offer({ ...started }), P = await offer({ ...started })
      const O3 = await order('9829333003')
      await tx.insert(orderDiscounts).values([
        { tenantId: A, orderId: O3, discountId: C, class: 'order', method: 'cod', amount: 10000, title: 'x', style: 'order_off', percentBps: 1000, minSubtotal: 0 },
        { tenantId: A, orderId: O3, discountId: P, class: 'payment', amount: 5000, title: 'y', style: 'pay_online', amountOff: 5000, minSubtotal: 0 },
      ])
      await tx.update(discounts).set({ pausedAt: now }).where(eq(discounts.id, C))
      expect(await offersStillFit(tx, A, O3, '9829333003', now, 'prepaid')).toBe(true)
      expect(await offersStillFit(tx, A, O3, '9829333003', now, 'cod')).toBe(false)
      await tx.update(discounts).set({ pausedAt: null }).where(eq(discounts.id, C))
      await tx.update(discounts).set({ pausedAt: now }).where(eq(discounts.id, P))
      expect(await offersStillFit(tx, A, O3, '9829333003', now, 'cod')).toBe(true)
      expect(await offersStillFit(tx, A, O3, '9829333003', now, 'prepaid')).toBe(false)
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
