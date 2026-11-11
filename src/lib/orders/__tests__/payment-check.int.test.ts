// The payment check on a real Postgres (tenant A of the proof; skipped unless INT_DB_HOST is set, as in CI), with
// Razorpay's answer stubbed (shop stress test 2026-11-11; impact review): a capture Razorpay reports is recorded once —
// whether or not the order was switched to COD meanwhile — with one "confirmed" email; a payment in flight or Razorpay
// silent asks again later; after 72 hours the row gives up. settleWithRazorpay commits (its own transactions): the
// rows it writes are removed in `finally`.
import { describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

const answer: { pays: unknown[] | null } = { pays: [] }
vi.mock('@/lib/payments/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/razorpay')>()), orderPayments: async () => answer.pays }))
vi.mock('@/lib/queries/storefront', async (orig) => ({ ...(await orig<typeof import('@/lib/queries/storefront')>()), refreshSoldOut: () => {} }))

describe.skipIf(!host)('asking Razorpay when a hold ends', () => {
  it('records a capture once (also after a switch to COD), waits on one in flight, gives up after 72 hours', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines, paymentKeys } = await import('@/lib/db/schema-orders')
    const { outbox } = await import('@/lib/db/schema')
    const { saveKeys } = await import('@/lib/payments/keys')
    const { sendPaymentCheck, settleWithRazorpay } = await import('@/lib/orders/payment-check')
    const { Later, GiveUp } = await import('@/lib/outbox')
    const { and, eq, inArray, like } = await import('drizzle-orm')

    const had = await withTenant(A, async (tx) => (await tx.select().from(paymentKeys).where(eq(paymentKeys.tenantId, A)))[0] ?? null)
    const made: string[] = []
    const base = 940_000 + (Date.now() % 50_000) * 10 // each run its own numbers: frata_app can't delete orders
    try {
      await withTenant(A, (tx) => saveKeys(tx, A, { keyId: 'rzp_test_INTCHECK000001', keySecret: 'int-secret' }))
      const order = async (n: number, o: Partial<typeof orders.$inferInsert> = {}) => withTenant(A, async (tx) => {
        const [r] = await tx.insert(orders).values({ tenantId: A, number: base + n, paymentMethod: 'prepaid', placedAt: new Date(Date.now() - 1_800_000), payBy: new Date(Date.now() - 60_000),
          razorpayOrderId: `order_INT${base + n}`, email: 'int@example.com', subtotal: 249000, total: 249000, checkout: { onlineTotal: 249000 }, ...o }).returning({ id: orders.id })
        made.push(r!.id); return r!.id
      })
      const row = (orderId: string, createdAt = new Date()) => ({ id: crypto.randomUUID(), tenantId: A, kind: 'payment.check', dedupeKey: 'x', payload: { orderId }, attempts: 1,
        nextAttemptAt: new Date(), sentAt: null, deadAt: null, lastError: null, createdAt }) as Parameters<typeof sendPaymentCheck>[0]
      const paidAt = async (id: string) => (await withTenant(A, (tx) => tx.select({ p: orders.paidAt }).from(orders).where(eq(orders.id, id))))[0]!.p

      // Captured at exactly the amount asked: paid, once, one "confirmed" email; a second check changes nothing.
      const a = await order(1)
      answer.pays = [{ id: 'pay_INTCHECK1', status: 'captured', amount: 249000, currency: 'INR', fee: 5000, tax: 900, method: 'upi' }]
      await sendPaymentCheck(row(a))
      expect(await paidAt(a)).not.toBeNull()
      await sendPaymentCheck(row(a))
      const mails = await withTenant(A, (tx) => tx.select({ k: outbox.dedupeKey }).from(outbox).where(and(eq(outbox.tenantId, A), eq(outbox.kind, 'email.order'), like(outbox.dedupeKey, `email:confirmed:${a}`))))
      expect(mails).toHaveLength(1)

      // A capture for another amount is not ours to record.
      const b = await order(2)
      answer.pays = [{ id: 'pay_INTCHECK2', status: 'captured', amount: 100, currency: 'INR', fee: null, tax: null, method: 'upi' }]
      expect(await settleWithRazorpay(A, b)).toBe('unpaid')
      expect(await paidAt(b)).toBeNull()

      // Switched to COD meanwhile, then captured with the webhook lost: still recorded (the courier collects nothing).
      const c = await order(3, { switchedToCodAt: new Date(Date.now() - 30_000), payBy: null, codCharge: 4900, gstTotal: 11857 + 233, total: 253900 })
      await withTenant(A, (tx) => tx.insert(orderLines).values({ tenantId: A, orderId: c, title: 'Kurta', qty: 1, unitPrice: 249000, taxableValue: 237143, gst: 11857, gstBps: 500,
        kind: 'in_stock', position: 0, chargeTaxable: 4667, chargeGst: 233, stockTakenAt: new Date() }))
      answer.pays = [{ id: 'pay_INTCHECK3', status: 'captured', amount: 249000, currency: 'INR', fee: null, tax: null, method: 'upi' }]
      expect(await settleWithRazorpay(A, c)).toBe('paid')

      // In flight → later; Razorpay silent → later; still so after 72 hours → give up.
      const d = await order(4)
      answer.pays = [{ id: 'pay_INTCHECK4', status: 'authorized', amount: 249000, currency: 'INR', fee: null, tax: null, method: 'upi' }]
      await expect(sendPaymentCheck(row(d))).rejects.toBeInstanceOf(Later)
      answer.pays = null
      await expect(sendPaymentCheck(row(d))).rejects.toBeInstanceOf(Later)
      await expect(sendPaymentCheck(row(d, new Date(Date.now() - 73 * 3_600_000)))).rejects.toBeInstanceOf(GiveUp)
      // No payment at all: nothing to do, the row is done.
      answer.pays = []
      await expect(sendPaymentCheck(row(d))).resolves.toBeUndefined()
      expect(await paidAt(d)).toBeNull()
    } finally {
      await withTenant(A, async (tx) => {
        // Orders are never deleted by frata_app: the test's are cancelled (as the offers int test does); their emails dropped.
        if (made.length) {
          await tx.delete(outbox).where(and(eq(outbox.tenantId, A), inArray(outbox.dedupeKey, made.flatMap((id) => [`email:confirmed:${id}`, `email:finish_paying:${id}`]))))
          await tx.update(orders).set({ cancelledAt: new Date() }).where(and(eq(orders.tenantId, A), inArray(orders.id, made)))
        }
        if (had) await tx.update(paymentKeys).set(had).where(eq(paymentKeys.tenantId, A))
        else await tx.delete(paymentKeys).where(eq(paymentKeys.tenantId, A))
      })
    }
  })
})
