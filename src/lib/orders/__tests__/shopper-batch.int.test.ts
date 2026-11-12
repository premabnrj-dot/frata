// The shopper batch (2026-11-12) on a real Postgres (a throwaway shop made from shop A of the proof, so the other int
// tests on A see none of its offers or holds; skipped unless INT_DB_HOST is set, as in CI), with Razorpay's answer and
// the cache purge stubbed:
//  1. the product page's stock is checkout's: stock − held − owed; an order whose stock or hold takes the last piece
//     purges the cached pages; a retry that finds its order is no new order (`fresh`, the phone limit's count);
//  2. a dismissed Razorpay sheet ends the hold (pay_by := now) unless Razorpay has a payment in flight; a retry renews it
//     and queues its payment check; a capture after the release is still recorded and takes the stock;
//  3. an offer used up (total limit) leaves the bar and the cards, and the order that used it up purges the pages; the
//     bar picks the started offer, never a draft or an ended one that still asks for it.
// The throwaway shop and its rows are left in the proof database (frata_app deletes no orders).
import { describe, expect, it, vi } from 'vitest'

const HOST = 'kesar-studio.frata.test'
const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'
const ME = '99999999-9999-9999-9999-999999999999'
const address = (phone: string) => ({ name: 'Int Shopper', phone, addressLine: '12 MG Road', area: 'Vaishali Nagar', landmark: '', pincode: '302021', city: 'Jaipur', state: 'Rajasthan' as const, email: null })

const answer: { pays: unknown[] | null } = { pays: [] }
const purged: string[] = []
vi.mock('@/lib/payments/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/razorpay')>()), orderPayments: async () => (answer.pays === null ? { ok: false, status: 503 } : { ok: true, items: answer.pays }) }))
vi.mock('@/lib/queries/storefront', async (orig) => ({ ...(await orig<typeof import('@/lib/queries/storefront')>()), refreshSoldOut: async (t: string) => { purged.push(t); return 'now' as const } }))

describe.skipIf(!host)('the shopper batch', () => {
  it('stock with holds, a released hold, used-up offers', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { default: postgres } = await import('postgres')
    const { randomUUID } = await import('node:crypto')
    const { withTenant } = await import('@/lib/db/tenant')
    const { outbox } = await import('@/lib/db/schema')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { discounts } = await import('@/lib/db/schema-discounts')
    const { saveKeys } = await import('@/lib/payments/keys')
    const { orderToken, tokenHash } = await import('@/lib/crypto/secret-box')
    const { placeOrder } = await import('@/lib/orders/place')
    const { markPaid, releaseHold, retryPayment } = await import('@/lib/orders/payment')
    const { catalogueEntry } = await import('@/lib/queries/storefront')
    const { coreAnnouncement } = await import('@/lib/queries/announcement')
    const { quoteData } = await import('@/lib/queries/checkout')
    const { quote } = await import('@/domains/checkout/quote')
    const { and, eq, like, sql } = await import('drizzle-orm')

    const stamp = Date.now()
    const su = postgres(`postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const [{ id: A }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-batch-' + stamp}, 'Int batch') returning id`
    await su`create temp table batch_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
    await su`update batch_shop set tenant_id = ${A}, published_at = now(), cod_on = true, cod_min = 0, cod_max = 0, cod_charge = 0, shipping_flat = 0, free_shipping_above = 0, cod_blocked_pincodes = '{}', prices_include_gst = true`
    await su`insert into shop_settings select * from batch_shop`
    await su.end()

    const made = await withTenant(A, async (tx) => {
      await saveKeys(tx, A, { keyId: 'rzp_test_INTBATCH000001', keySecret: 'int-secret' })
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-batch-${stamp}`, title: 'Int kurta', options: ['Size'], status: 'active', hsn: '6211' }).returning({ id: products.id })
      const [v1] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 99900, stock: 2 }).returning({ id: variants.id })
      const [v2] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['L'], price: 99900, stock: 9 }).returning({ id: variants.id })
      return { product: p!.id, v1: v1!.id, v2: v2!.id }
    })
    let n = 0
    const key = () => `batch${stamp}${++n}`.padEnd(22, 'x').slice(0, 22)
    const phone = () => `98292${String(stamp).slice(-4)}${n % 10}`
    const shown = async (variant: string) => (await catalogueEntry(A)).products.find((x) => x.id === made.product)!.variants.find((v) => v.id === variant)!.stock
    const codTotal = async (bag: { variantId: string; qty: number }[]) => {
      const now = new Date(); const d = await quoteData(A, bag.map((b) => b.variantId), now, null, HOST)
      return quote(bag, d.rows, d.shop!, now, '302021', { offers: d.offers }).cod.total
    }
    /** An unpaid online order holding `qty` of `variant` (as placement writes one), with its Razorpay order. */
    const holding = async (variant: string, qty: number) => withTenant(A, async (tx) => {
      const id = randomUUID()
      const [c] = await tx.execute<{ n: number }>(sql`select 900000 + (count(*))::int n from orders where tenant_id = ${A}`)
      await tx.insert(orders).values({ id, tenantId: A, number: c!.n, paymentMethod: 'prepaid', placedAt: new Date(), payBy: new Date(Date.now() + 20 * 60_000), tokenHash: tokenHash(orderToken(id)),
        razorpayOrderId: `order_INTB${stamp % 1_000_000}${c!.n}`, phone: phone(), subtotal: 99900 * qty, total: 99900 * qty, checkout: { onlineTotal: 99900 * qty } })
      await tx.insert(orderLines).values({ tenantId: A, orderId: id, variantId: variant, productId: made.product, title: 'Int kurta', qty, unitPrice: 99900, taxableValue: 95143 * qty, gst: 4757 * qty, gstBps: 500, kind: 'in_stock', position: 0 })
      return id
    })
    const payBy = async (id: string) => (await withTenant(A, (tx) => tx.select({ p: orders.payBy }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.id, id)))))[0]!.p!

    // 1. Holds count on the product page, as at checkout.
    const h = await holding(made.v1, 1)
    expect(await shown(made.v1)).toBe(1) // 2 in stock, 1 held (was 2: stock − owed only)
    // The shop's grouped read and checkout's per-variant one are the same rule.
    await withTenant(A, async (tx) => {
      const { heldByVariant } = await import('@/lib/db/order-predicates')
      const { variantRows } = await import('@/lib/queries/checkout')
      const now = new Date(), map = await heldByVariant(tx, A, now), rows = await variantRows(tx, A, [made.v1, made.v2], now)
      expect(rows.map((r) => [r.held, map.get(r.variantId) ?? 0])).toEqual(rows.map((r) => [r.variantId === made.v1 ? 1 : 0, r.variantId === made.v1 ? 1 : 0]))
    })
    // A COD order takes the last free piece (stock 2 → 1, but that one is held): sold out, so the pages are purged.
    purged.length = 0
    const k = key()
    const r1 = await placeOrder(A, { host: HOST, idempotencyKey: k, bag: [{ variantId: made.v1, qty: 1 }], address: address(phone()), method: 'cod', expectedTotal: await codTotal([{ variantId: made.v1, qty: 1 }]), facts: {} })
    expect(r1).toMatchObject({ kind: 'placed', fresh: true })
    expect(purged).toEqual([A])
    expect(await shown(made.v1)).toBe(0)
    // The same try again (the response lost): its order, found, not a new one (the phone limit gives the try back).
    const again = await placeOrder(A, { host: HOST, idempotencyKey: k, bag: [{ variantId: made.v1, qty: 1 }], address: address(phone()), method: 'cod', expectedTotal: 0, facts: {} })
    expect(again).toMatchObject({ kind: 'placed', fresh: false, number: r1.kind === 'placed' ? r1.number : -1 })

    // 2. The sheet closed: Razorpay has a payment in flight → the hold stays; nothing in flight → it ends now.
    const hash = tokenHash(orderToken(h))
    const before = await payBy(h)
    answer.pays = [{ id: 'pay_INTB1', status: 'authorized', amount: 99900, currency: 'INR', fee: null, tax: null, method: 'upi' }]
    expect(await releaseHold(A, hash)).toBe('kept')
    expect((await payBy(h)).getTime()).toBe(before.getTime())
    answer.pays = [{ id: 'pay_INTB1', status: 'failed', amount: 99900, currency: 'INR', fee: null, tax: null, method: 'upi' }]
    purged.length = 0
    expect(await releaseHold(A, hash)).toBe('released')
    expect((await payBy(h)).getTime()).toBeLessThanOrEqual(Date.now())
    expect(await shown(made.v1)).toBe(1) // the held piece is on sale again
    expect(purged).toEqual([A]) // it was the last one: the pages say so at once
    expect(await releaseHold(A, hash)).toBe('kept') // nothing left to release
    // A retry renews the hold and queues a payment check for its end.
    const retried = await retryPayment(A, hash)
    expect(retried.ok).toBe(true)
    const renewed = await payBy(h)
    expect(renewed.getTime()).toBeGreaterThan(Date.now() + 19 * 60_000)
    const checks = await withTenant(A, (tx) => tx.select({ k: outbox.dedupeKey }).from(outbox).where(and(eq(outbox.tenantId, A), like(outbox.dedupeKey, `payment.check:${h}:%`))))
    expect(checks.map((c) => c.k)).toContain(`payment.check:${h}:${renewed.getTime()}`)
    // Released again, then captured after all: recorded, and the stock taken.
    answer.pays = []
    expect(await releaseHold(A, hash)).toBe('released')
    await withTenant(A, (tx) => markPaid(tx, { id: h, tenantId: A }, { paymentId: 'pay_INTB2' }))
    const [paid] = await withTenant(A, (tx) => tx.select({ paidAt: orders.paidAt, taken: orderLines.stockTakenAt }).from(orders)
      .innerJoin(orderLines, and(eq(orderLines.tenantId, orders.tenantId), eq(orderLines.orderId, orders.id))).where(and(eq(orders.tenantId, A), eq(orders.id, h))))
    expect(paid!.paidAt).not.toBeNull(); expect(paid!.taken).not.toBeNull()
    expect(await withTenant(A, async (tx) => (await tx.select({ s: variants.stock }).from(variants).where(and(eq(variants.tenantId, A), eq(variants.id, made.v1))))[0]!.s)).toBe(0)

    // 3. The bar: a draft and an ended offer that still ask for it never hide the started one.
    const offer = (o: Partial<typeof discounts.$inferInsert>) => withTenant(A, async (tx) => (await tx.insert(discounts).values({ tenantId: A, title: 'Offer', style: 'order_off', startsAt: new Date(Date.now() - 60_000), createdBy: ME, ...o }).returning({ id: discounts.id }))[0]!.id)
    await offer({ title: 'Ended', amountOff: 5000, announce: true, startedAt: new Date(Date.now() - 3_600_000), startedBy: ME, endedAt: new Date(Date.now() - 60_000) })
    await offer({ title: 'Draft', amountOff: 5000, announce: true })
    await offer({ title: 'One left', amountOff: 10000, announce: true, limitTotal: 1, startedAt: new Date(), startedBy: ME })
    const sale = await offer({ title: 'Sale', style: 'product_off', percentBps: 1000, limitTotal: 1, startedAt: new Date(), startedBy: ME })
    expect((await coreAnnouncement(A))?.title).toBe('One left')
    const entry = await catalogueEntry(A)
    expect(entry.offers.map((o) => o.label)).toEqual([expect.stringMatching(/^Sale: /)])
    // One order uses both up: it purges the pages, and neither is shown again.
    purged.length = 0
    const bag = [{ variantId: made.v2, qty: 1 }]
    const r2 = await placeOrder(A, { host: HOST, idempotencyKey: key(), bag, address: address(phone()), method: 'cod', expectedTotal: await codTotal(bag), facts: {} })
    expect(r2).toMatchObject({ kind: 'placed', total: 99900 - 9900 - 10000 }) // 10% of ₹999 in whole rupees (₹99), then ₹100
    expect(purged).toEqual([A])
    expect(await coreAnnouncement(A)).toBeNull()
    expect((await catalogueEntry(A)).offers).toEqual([])
    void sale
  })
})
