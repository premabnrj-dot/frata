// A prepaid drop on a real Postgres (a throwaway shop made from shop A of the proof, so the other int tests on A neither
// hold its slots nor see its orders; skipped unless INT_DB_HOST is set, as in CI). A payment landing, a switch to pay on
// delivery and a retried payment take stock like a placement: they share the shop's slots and the 2 s lock wait. A
// captured payment is recorded FIRST (a webhook_events row, no lock) and keeps its order's hold; busy leaves it for the
// next pass, which marks the order paid — never lost, never "not paid" (impact reviews 2026-11-11). Razorpay's payment
// lookup is stubbed; nothing leaves the machine. The throwaway shop and its rows are left in the proof database.
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'
// What Razorpay says the order's payments are, when switchToCod asks.
const razorpay = { pays: [] as { id: string; status: string; amount: number; fee: number | null; tax: number | null; method: string | null }[] }

describe.skipIf(!host)('payments at a prepaid drop', () => {
  it('a captured payment is recorded before busy, keeps its hold, and the next pass marks the order paid', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    vi.doMock('@/lib/payments/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/razorpay')>()), orderPayments: async () => razorpay.pays }))
    const { default: postgres } = await import('postgres')
    const { withTenant } = await import('@/lib/db/tenant')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { webhookEvents } = await import('@/lib/db/schema')
    const { PLACE_SLOTS } = await import('@/lib/orders/place')
    const { confirmPayment, paymentWaiting, processEvents, retryPayment, storeRazorpayEvent, switchToCod } = await import('@/lib/orders/payment')
    const { saveKeys } = await import('@/lib/payments/keys')
    const { tokenHash } = await import('@/lib/crypto/secret-box')
    const { and, eq, isNull, sql } = await import('drizzle-orm')

    const stamp = Date.now()
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const [{ id: A }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-paybusy-' + stamp}, 'Int pay busy') returning id`
    await su`create temp table busy_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
    await su`update busy_shop set tenant_id = ${A}, published_at = now(), cod_on = true, cod_min = 0, cod_max = 0, cod_charge = 0, shipping_flat = 0, free_shipping_above = 0, cod_blocked_pincodes = '{}'`
    await su`insert into shop_settings select * from busy_shop`
    await su.end()
    const SECRET = `intsecret${stamp}`

    // Three unpaid online orders for one piece each: o1 paid in the browser, o2 found paid by a switch, o3's hold over.
    const made = await withTenant(A, async (tx) => {
      await saveKeys(tx, A, { keyId: `rzp_test_int${stamp}`, keySecret: SECRET })
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-paybusy-${stamp}`, title: 'Int drop tee', options: ['Size'], status: 'active', hsn: '6109' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 99900, stock: 5 }).returning({ id: variants.id })
      const order = async (n: number, payBy: Date) => {
        const token = `tok${n}${stamp}`.padEnd(22, 'x').slice(0, 22), rzp = `order_int${n}${stamp}`
        const [o] = await tx.insert(orders).values({ tenantId: A, number: 1000 + n, paymentMethod: 'prepaid', placedAt: new Date(), payBy, tokenHash: tokenHash(token),
          razorpayOrderId: rzp, checkout: { onlineTotal: 99900 }, subtotal: 99900, total: 99900, pincode: '302021' }).returning({ id: orders.id })
        await tx.insert(orderLines).values({ tenantId: A, orderId: o!.id, variantId: v!.id, title: 'Int drop tee', qty: 1, unitPrice: 99900, taxableValue: 99900, gst: 0, gstBps: 0, kind: 'in_stock', position: 0 })
        return { id: o!.id, token, rzp, pay: `pay_int${n}${stamp}` }
      }
      const soon = new Date(Date.now() + 5 * 60_000)
      return { variant: v!.id, o1: await order(1, soon), o2: await order(2, soon), o3: await order(3, new Date(Date.now() - 60_000)) }
    })
    const read = (id: string) => withTenant(A, async (tx) => (await tx.select({ paidAt: orders.paidAt, payBy: orders.payBy }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.id, id))))[0]!)
    const stock = () => withTenant(A, async (tx) => (await tx.select({ n: variants.stock }).from(variants).where(and(eq(variants.tenantId, A), eq(variants.id, made.variant))))[0]!.n)
    const pending = () => withTenant(A, async (tx) => (await tx.select({ n: sql<number>`count(*)::int` }).from(webhookEvents)
      .where(and(eq(webhookEvents.tenantId, A), eq(webhookEvents.provider, 'razorpay'), isNull(webhookEvents.processedAt))))[0]!.n)
    const waiting = (rzp: string) => withTenant(A, (tx) => paymentWaiting(tx, A, rzp))
    const signed = (o: { rzp: string; pay: string }) => ({ paymentId: o.pay, signature: createHmac('sha256', SECRET).update(`${o.rzp}|${o.pay}`).digest('hex') })

    // Other instances: one connection holds every slot (session locks), one the drop's stock row.
    const others = postgres(process.env.DATABASE_URL, { max: 2 })
    const slots = await others.reserve()
    const slot = (s: number) => others`select hashtextextended(${A + ':place'}, ${s}) as k`.then((r) => r[0]!.k as string)
    const takeAll = async () => { for (let s = 0; s < PLACE_SLOTS; s++) await slots`select pg_advisory_lock(${await slot(s)}::bigint)` }
    const row = { release: () => {} }
    try {
      expect(await processEvents(A)).toBe(0) // nothing waiting: no slot taken, nothing done
      await takeAll()

      // 1. Every slot taken. The browser's signed reply: recorded, the hold kept, busy; the order not yet paid.
      let t0 = Date.now()
      expect(await confirmPayment(A, made.o1.token, signed(made.o1))).toMatchObject({ ok: false, status: 503 })
      expect(Date.now() - t0).toBeLessThan(1500)
      expect(await pending()).toBe(1)
      expect(await waiting(made.o1.rzp)).toBe(true)
      const o1 = await read(made.o1.id)
      expect(o1.paidAt).toBeNull()
      expect(o1.payBy!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000) // held 15 minutes from now, not the 5 left
      // A forged reply is refused before anything is recorded.
      expect(await confirmPayment(A, made.o1.token, { ...signed(made.o1), signature: 'f'.repeat(64) })).toMatchObject({ ok: false, status: 400 })
      // A switch that finds the payment captured at Razorpay: recorded under Razorpay's own key, busy.
      razorpay.pays = [{ id: made.o2.pay, status: 'captured', amount: 99900, fee: 2000, tax: 360, method: 'upi' }]
      expect(await switchToCod(A, made.o2.token, 99900)).toMatchObject({ kind: 'refused', status: 503 })
      expect(await waiting(made.o2.rzp)).toBe(true)
      // A plain switch, and a retried payment: busy, nothing changed.
      razorpay.pays = []
      expect(await switchToCod(A, made.o3.token, 99900)).toMatchObject({ kind: 'refused', status: 503 })
      expect(await retryPayment(A, made.o3.token)).toMatchObject({ ok: false, status: 503 })
      expect(await processEvents(A)).toBe(0)
      expect(await pending()).toBe(2)
      // A capture for an order whose hold already ran out never holds its pieces again.
      const before3 = (await read(made.o3.id)).payBy!.getTime()
      await storeRazorpayEvent(A, `razorpay:payment.captured:${made.o3.pay}`, { event: 'payment.captured',
        payload: { payment: { entity: { id: made.o3.pay, order_id: made.o3.rzp, amount: 99900, currency: 'INR', status: 'captured' } } } })
      expect((await read(made.o3.id)).payBy!.getTime()).toBe(before3)
      await slots`select pg_advisory_unlock_all()`

      // 2. The stock row held elsewhere past 2 s: the pass times out inside the first event's savepoint and LEAVES
      //    every event (marking one processed would lose a payment).
      await new Promise<void>((ready) => {
        void others.begin(async (sql) => {
          await sql`select set_config('app.tenant_id', ${A}, true)`
          await sql`select id from variants where tenant_id = ${A} and id = ${made.variant} for update`
          ready()
          await new Promise<void>((r) => { row.release = r })
        })
      })
      t0 = Date.now()
      expect(await processEvents(A)).toBe(0)
      expect(Date.now() - t0).toBeGreaterThanOrEqual(1900)
      expect(Date.now() - t0).toBeLessThan(4000)
      expect(await pending()).toBe(3)
      row.release()
      await new Promise((r) => setTimeout(r, 100))

      // 3. The next pass: all three paid, a piece taken for each, nothing waiting.
      expect(await processEvents(A)).toBe(3)
      expect(await pending()).toBe(0)
      expect((await read(made.o1.id)).paidAt).not.toBeNull()
      expect((await read(made.o2.id)).paidAt).not.toBeNull()
      expect((await read(made.o3.id)).paidAt).not.toBeNull()
      expect(await stock()).toBe(2)
      expect(await waiting(made.o1.rzp)).toBe(false)
    } finally {
      row.release()
      await slots`select pg_advisory_unlock_all()`.catch(() => {})
      slots.release()
      await others.end()
      vi.doUnmock('@/lib/payments/razorpay')
    }
  }, 30_000)
})
