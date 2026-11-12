// A prepaid drop on a real Postgres (a throwaway shop made from shop A of the proof, so the other int tests on A neither
// hold its slots nor see its orders; skipped unless INT_DB_HOST is set, as in CI). A payment landing and a switch to pay
// on delivery take stock like a placement: they share the shop's slots and the 2 s lock wait. Past either nothing is
// written — and a webhook event is LEFT unprocessed, never marked done (that would lose the payment), so a later pass
// marks the order paid (impact review 2026-11-11). The throwaway shop and its rows are left in the proof database.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('payments at a prepaid drop', () => {
  it('busy leaves the event for later and writes nothing; the next pass marks the order paid and takes the stock', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { default: postgres } = await import('postgres')
    const { withTenant } = await import('@/lib/db/tenant')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { webhookEvents } = await import('@/lib/db/schema')
    const { PLACE_SLOTS } = await import('@/lib/orders/place')
    const { confirmPayment, processEvents, storeRazorpayEvent, switchToCod } = await import('@/lib/orders/payment')
    const { tokenHash } = await import('@/lib/crypto/secret-box')
    const { and, eq, isNull, sql } = await import('drizzle-orm')

    const stamp = Date.now()
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const [{ id: A }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-paybusy-' + stamp}, 'Int pay busy') returning id`
    await su`create temp table busy_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
    await su`update busy_shop set tenant_id = ${A}, published_at = now(), cod_on = true, cod_min = 0, cod_max = 0, cod_charge = 0, shipping_flat = 0, free_shipping_above = 0, cod_blocked_pincodes = '{}'`
    await su`insert into shop_settings select * from busy_shop`
    await su.end()

    // One unpaid online order holding one piece, its Razorpay order id ours, and Razorpay's captured event stored.
    const token = `tok${stamp}`.padEnd(22, 'x').slice(0, 22)
    const rzp = `order_int${stamp}`
    const made = await withTenant(A, async (tx) => {
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-paybusy-${stamp}`, title: 'Int drop tee', options: ['Size'], status: 'active', hsn: '6109' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 99900, stock: 5 }).returning({ id: variants.id })
      const [o] = await tx.insert(orders).values({ tenantId: A, number: 1001, paymentMethod: 'prepaid', placedAt: new Date(), payBy: new Date(Date.now() + 20 * 60_000), tokenHash: tokenHash(token),
        razorpayOrderId: rzp, checkout: { onlineTotal: 99900 }, subtotal: 99900, total: 99900, pincode: '302021' }).returning({ id: orders.id })
      await tx.insert(orderLines).values({ tenantId: A, orderId: o!.id, variantId: v!.id, title: 'Int drop tee', qty: 1, unitPrice: 99900, taxableValue: 99900, gst: 0, gstBps: 0, kind: 'in_stock', position: 0 })
      return { variant: v!.id, order: o!.id }
    })
    await storeRazorpayEvent(A, `pay_int${stamp}:payment.captured`, { event: 'payment.captured',
      payload: { payment: { entity: { id: `pay_int${stamp}`, order_id: rzp, amount: 99900, currency: 'INR', status: 'captured', fee: 2000, tax: 360 } } } })
    const state = () => withTenant(A, async (tx) => ({
      paid: !!(await tx.select({ at: orders.paidAt }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.id, made.order))))[0]!.at,
      stock: (await tx.select({ n: variants.stock }).from(variants).where(and(eq(variants.tenantId, A), eq(variants.id, made.variant))))[0]!.n,
    }))
    const pending = () => withTenant(A, async (tx) => (await tx.select({ n: sql<number>`count(*)::int` }).from(webhookEvents)
      .where(and(eq(webhookEvents.tenantId, A), eq(webhookEvents.provider, 'razorpay'), isNull(webhookEvents.processedAt))))[0]!.n)

    // Other instances: one connection holds every slot (session locks), one the drop's stock row.
    const others = postgres(process.env.DATABASE_URL, { max: 2 })
    const slots = await others.reserve()
    const slot = (s: number) => others`select hashtextextended(${A + ':place'}, ${s}) as k`.then((r) => r[0]!.k as string)
    const row = { release: () => {} }
    try {
      for (let s = 0; s < PLACE_SLOTS; s++) await slots`select pg_advisory_lock(${await slot(s)}::bigint)`

      // 1. Every slot taken: the webhook pass leaves the event, the browser's confirm and the switch are busy; nothing written.
      let t0 = Date.now()
      expect(await processEvents(A)).toBe(0)
      expect(await confirmPayment(A, token, { paymentId: `pay_int${stamp}`, signature: 'f'.repeat(64) })).toMatchObject({ ok: false, status: 503 })
      expect(await switchToCod(A, token, 99900)).toMatchObject({ kind: 'refused', status: 503 })
      expect(Date.now() - t0).toBeLessThan(1500)
      expect(await pending()).toBe(1)
      expect(await state()).toMatchObject({ paid: false, stock: 5 })
      await slots`select pg_advisory_unlock_all()`

      // 2. The stock row held elsewhere past 2 s: the pass times out on it inside the event's savepoint and LEAVES the
      //    event (marking it processed would lose the payment).
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
      expect(await pending()).toBe(1)
      expect(await state()).toMatchObject({ paid: false, stock: 5 })
      row.release()
      await new Promise((r) => setTimeout(r, 100))

      // 3. The next pass (the 5-minute drain, the order page): paid, the piece taken, the event done.
      expect(await processEvents(A)).toBe(1)
      expect(await pending()).toBe(0)
      expect(await state()).toMatchObject({ paid: true, stock: 4 })
    } finally {
      row.release()
      await slots`select pg_advisory_unlock_all()`.catch(() => {})
      slots.release()
      await others.end()
    }
  }, 20_000)
})
