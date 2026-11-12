// Today's repricing and stock, pinned on a real Postgres before the order edit builds on them (plan
// docs/plans/2026-11-12-order-edit.md, OE·0). A throwaway shop made from shop A of the proof (so the other int tests on A
// see none of its offers or holds; skipped unless INT_DB_HOST is set, as in CI), with Razorpay and the cache purge
// stubbed; nothing leaves the machine:
//  1. placed online with two order offers (the one paying on delivery gets kept beside the online one), free delivery and
//     the pay-online saving: a switch to COD (switchToCod, the real write) prices it to exactly the checkout's COD card and
//     takes its stock; a capture after it (markPaid, before packing) puts every money column back as placed and takes
//     nothing twice; a capture after packing keeps the COD figures (the invoice is never rewritten);
//  2. stock per order: a COD placement takes each line's stock and stamps it; a cancel that restocks puts back exactly
//     what was taken, says which variants came back from 0, and a second put-back returns nothing; a cancel that does not
//     restock leaves it taken; an online order that never paid has nothing to put back.
// The throwaway shop and its rows are left in the proof database (frata_app deletes no orders).
import { describe, expect, it, vi } from 'vitest'

const HOST = 'kesar-studio.frata.test'
const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'
const ME = '99999999-9999-9999-9999-999999999999'
const ACTOR = { kind: 'member' as const, userId: ME, email: 'int@frata.test' }
const address = (phone: string) => ({ name: 'Int Shopper', phone, addressLine: '12 MG Road', area: 'Vaishali Nagar', landmark: '', pincode: '302021', city: 'Jaipur', state: 'Rajasthan' as const, email: null })

let rzp = 0
vi.mock('@/lib/payments/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/razorpay')>()),
  createOrder: async () => ({ ok: true as const, id: `order_INTRS${Date.now() % 1_000_000}${++rzp}` }),
  orderPayments: async () => ({ ok: true as const, items: [] }) }))
// Online payment is offered: live keys that have seen a webhook, on an approved host (D1·8).
vi.mock('@/lib/payments/keys', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/keys')>()), canTakeOnline: (k: unknown) => !!k }))
vi.mock('@/lib/queries/addresses', async (orig) => ({ ...(await orig<typeof import('@/lib/queries/addresses')>()), hostApprovedIn: async () => true }))
vi.mock('@/lib/queries/storefront', async (orig) => ({ ...(await orig<typeof import('@/lib/queries/storefront')>()), refreshSoldOut: async () => 'now' as const }))

async function setup() {
  process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
  process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
  const { default: postgres } = await import('postgres')
  const stamp = Date.now()
  const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
  const [{ id: A }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-rs-' + stamp}, 'Int reprice stock') returning id`
  await su`create temp table rs_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
  await su`update rs_shop set tenant_id = ${A}, published_at = now(), cod_on = true, cod_min = 0, cod_max = 0, cod_charge = 4900, shipping_flat = 5000, free_shipping_above = 0,
    cod_blocked_pincodes = '{}', prices_include_gst = true, gstin = '08ABCDE1234F1Z5', gst_scheme = 'regular'`
  await su`insert into shop_settings select * from rs_shop`
  await su.end()
  return { A, stamp }
}

describe.skipIf(!host)('repricing and stock as they are today', () => {
  it('online → COD → captured: the real writes price each way exactly as checkout did', async () => {
    const { A, stamp } = await setup()
    const { withTenant } = await import('@/lib/db/tenant')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { discounts, orderDiscounts } = await import('@/lib/db/schema-discounts')
    const { saveKeys } = await import('@/lib/payments/keys')
    const { tokenHash } = await import('@/lib/crypto/secret-box')
    const { placeOrder } = await import('@/lib/orders/place')
    const { markPaid, switchToCod } = await import('@/lib/orders/payment')
    const { quoteData } = await import('@/lib/queries/checkout')
    const { quote } = await import('@/domains/checkout/quote')
    const { and, eq, inArray } = await import('drizzle-orm')

    const made = await withTenant(A, async (tx) => {
      await saveKeys(tx, A, { keyId: 'rzp_test_INTRS00000001', keySecret: 'int-secret' })
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-rs-${stamp}`, title: 'Int kurta', options: ['Size'], status: 'active', hsn: '6211' }).returning({ id: products.id })
      const [m, l] = await tx.insert(variants).values([
        { tenantId: A, productId: p!.id, optionValues: ['M'], price: 299900, stock: 5 },
        { tenantId: A, productId: p!.id, optionValues: ['L'], price: 149900, stock: 5 },
      ]).returning({ id: variants.id })
      const started = { startsAt: new Date(Date.now() - 60_000), startedAt: new Date(), startedBy: ME, createdBy: ME }
      // 10% that does not combine (paying on delivery gets it); ₹100 that does, with ₹400 for paying online (online gets
      // those: ₹500 beats ₹449); free delivery from ₹2,000.
      await tx.insert(discounts).values([
        { tenantId: A, title: 'Festive 10%', style: 'order_off', percentBps: 1000, combinesWithPayment: false, ...started },
        { tenantId: A, title: '₹100 off', style: 'order_off', amountOff: 10000, ...started },
        { tenantId: A, title: 'Pay online', style: 'pay_online', amountOff: 40000, ...started },
        { tenantId: A, title: 'Free delivery', style: 'free_shipping', minSubtotal: 200000, ...started },
      ])
      return { m: m!.id, l: l!.id }
    })
    const bag = [{ variantId: made.m, qty: 1 }, { variantId: made.l, qty: 1 }]
    const now = new Date()
    const d = await quoteData(A, bag.map((b) => b.variantId), now, null, HOST)
    const q = quote(bag, d.rows, d.shop!, now, '302021', { offers: d.offers })
    expect(q.prepaid.applied.map((a) => a.title).sort()).toEqual(['Free delivery', 'Pay online', '₹100 off'])
    expect(q.cod.applied.map((a) => a.title).sort()).toEqual(['Festive 10%', 'Free delivery'])
    expect(q.shipping).toBe(0)

    let n = 0
    const place = async () => {
      const r = await placeOrder(A, { host: HOST, idempotencyKey: `rs${stamp}${++n}`.padEnd(22, 'x').slice(0, 22), bag, address: address(`98293${String(stamp).slice(-4)}${n}`), method: 'prepaid', expectedTotal: q.prepaid.total, facts: {} })
      expect(r).toMatchObject({ kind: 'placed', method: 'prepaid', total: q.prepaid.total, pay: expect.any(Object) })
      const [o] = await withTenant(A, (tx) => tx.select({ id: orders.id }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.number, r.kind === 'placed' ? r.number : -1))))
      return { id: o!.id, hash: tokenHash(r.kind === 'placed' ? r.token : '') }
    }
    const read = (id: string) => withTenant(A, async (tx) => {
      const [x] = await tx.select({ total: orders.total, discount: orders.discount, cod: orders.codCharge, gst: orders.gstTotal, net: orders.merchandiseNet, shipping: orders.shipping, subtotal: orders.subtotal })
        .from(orders).where(and(eq(orders.tenantId, A), eq(orders.id, id)))
      const ls = await tx.select({ d: orderLines.lineDiscount, pd: orderLines.productDiscount, t: orderLines.taxableValue, bps: orderLines.gstBps, gst: orderLines.gst, ct: orderLines.chargeTaxable, cg: orderLines.chargeGst })
        .from(orderLines).where(and(eq(orderLines.tenantId, A), eq(orderLines.orderId, id))).orderBy(orderLines.position)
      return { ...x!, lines: ls }
    })
    const stock = () => withTenant(A, async (tx) => Object.fromEntries((await tx.select({ id: variants.id, s: variants.stock }).from(variants)
      .where(and(eq(variants.tenantId, A), inArray(variants.id, [made.m, made.l])))).map((v) => [v.id === made.m ? 'M' : 'L', v.s])))
    const taken = (id: string) => withTenant(A, async (tx) => (await tx.select({ at: orderLines.stockTakenAt }).from(orderLines)
      .where(and(eq(orderLines.tenantId, A), eq(orderLines.orderId, id))).orderBy(orderLines.position)).map((l) => l.at !== null))
    const asQuoted = (m: typeof q.prepaid) => ({ total: m.total, discount: m.discount, cod: m.codCharge, gst: m.gst, net: m.merchandiseNet, shipping: 0, subtotal: q.subtotal,
      lines: m.lines.map((l) => ({ d: l.discount, pd: l.productDiscount, t: l.taxable, bps: l.gstBps, gst: l.gst, ct: l.chargeTaxable, cg: l.chargeGst })) })

    // Placed online: the online card's figures, the stock held (not taken), both order offers kept, each with its way.
    const o1 = await place()
    const placedAs = await read(o1.id)
    expect(placedAs).toEqual(asQuoted(q.prepaid))
    expect(await taken(o1.id)).toEqual([false, false])
    expect(await stock()).toEqual({ M: 5, L: 5 })
    const kept = await withTenant(A, (tx) => tx.select({ title: orderDiscounts.title, cls: orderDiscounts.class, method: orderDiscounts.method, amount: orderDiscounts.amount })
      .from(orderDiscounts).where(and(eq(orderDiscounts.tenantId, A), eq(orderDiscounts.orderId, o1.id))))
    const byTitle = <T extends { title: string }>(xs: T[]) => [...xs].sort((a, b) => (a.title < b.title ? -1 : 1))
    expect(byTitle(kept)).toEqual(byTitle([
      { title: 'Festive 10%', cls: 'order', method: 'cod', amount: q.cod.applied.find((a) => a.class === 'order')!.amount },
      { title: 'Free delivery', cls: 'shipping', method: null, amount: 5000 },
      { title: 'Pay online', cls: 'payment', method: null, amount: 40000 },
      { title: '₹100 off', cls: 'order', method: 'prepaid', amount: 10000 },
    ]))

    // The switch: the COD card exactly (10% in, ₹100 and the saving out, the COD fee in), and the stock taken.
    expect(await switchToCod(A, o1.hash, q.cod.total)).toEqual({ kind: 'switched', total: q.cod.total })
    expect(await read(o1.id)).toEqual(asQuoted(q.cod))
    expect(await taken(o1.id)).toEqual([true, true])
    expect(await stock()).toEqual({ M: 4, L: 4 })

    // A capture after it, before packing: the online figures back, every column; nothing taken twice.
    expect(await withTenant(A, (tx) => markPaid(tx, { id: o1.id, tenantId: A }, { paymentId: `pay_INTRS${stamp}1` }))).toBe('paid')
    expect(await read(o1.id)).toEqual(placedAs)
    expect(await stock()).toEqual({ M: 4, L: 4 })
    // A second capture changes nothing.
    expect(await withTenant(A, (tx) => markPaid(tx, { id: o1.id, tenantId: A }, { paymentId: `pay_INTRS${stamp}1` }))).toBe('already')
    expect(await read(o1.id)).toEqual(placedAs)

    // Packed after the switch, then captured: the issued COD figures stay (GST Rule 46); the stock is not taken again.
    const o2 = await place()
    expect(await switchToCod(A, o2.hash, q.cod.total)).toMatchObject({ kind: 'switched' })
    await withTenant(A, (tx) => tx.update(orders).set({ confirmedAt: new Date(), packedAt: new Date(), invoiceNumber: `RS/26-27/${String(stamp).slice(-5)}` }).where(and(eq(orders.tenantId, A), eq(orders.id, o2.id))))
    expect(await stock()).toEqual({ M: 3, L: 3 })
    expect(await withTenant(A, (tx) => markPaid(tx, { id: o2.id, tenantId: A }, { paymentId: `pay_INTRS${stamp}2` }))).toBe('paid')
    expect(await read(o2.id)).toEqual(asQuoted(q.cod))
    expect(await stock()).toEqual({ M: 3, L: 3 })
  }, 30_000)

  it('stock per order: taken per line at placement, put back exactly once', async () => {
    const { A, stamp } = await setup()
    const { withTenant } = await import('@/lib/db/tenant')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { saveKeys } = await import('@/lib/payments/keys')
    const { placeOrder } = await import('@/lib/orders/place')
    const { cancel, putStockBack } = await import('@/lib/orders/work')
    const { quoteData } = await import('@/lib/queries/checkout')
    const { quote } = await import('@/domains/checkout/quote')
    const { and, eq, inArray } = await import('drizzle-orm')

    const made = await withTenant(A, async (tx) => {
      await saveKeys(tx, A, { keyId: 'rzp_test_INTRS00000002', keySecret: 'int-secret' })
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-rs-stock-${stamp}`, title: 'Int dupatta', options: ['Colour'], status: 'active', hsn: '6214' }).returning({ id: products.id })
      const [red, blue] = await tx.insert(variants).values([
        { tenantId: A, productId: p!.id, optionValues: ['Red'], price: 89900, stock: 2 },
        { tenantId: A, productId: p!.id, optionValues: ['Blue'], price: 89900, stock: 9 },
      ]).returning({ id: variants.id })
      return { red: red!.id, blue: blue!.id }
    })
    const stock = () => withTenant(A, async (tx) => Object.fromEntries((await tx.select({ id: variants.id, s: variants.stock }).from(variants)
      .where(and(eq(variants.tenantId, A), inArray(variants.id, [made.red, made.blue])))).map((v) => [v.id === made.red ? 'red' : 'blue', v.s])))
    const taken = (id: string) => withTenant(A, async (tx) => (await tx.select({ at: orderLines.stockTakenAt }).from(orderLines)
      .where(and(eq(orderLines.tenantId, A), eq(orderLines.orderId, id))).orderBy(orderLines.position)).map((l) => l.at !== null))
    let n = 0
    const place = async (bag: { variantId: string; qty: number }[], method: 'cod' | 'prepaid') => {
      const now = new Date(), d = await quoteData(A, bag.map((b) => b.variantId), now, null, HOST)
      const q = quote(bag, d.rows, d.shop!, now, '302021', { offers: d.offers })
      const r = await placeOrder(A, { host: HOST, idempotencyKey: `rss${stamp}${++n}`.padEnd(22, 'x').slice(0, 22), bag, address: address(`98294${String(stamp).slice(-4)}${n}`), method, expectedTotal: method === 'cod' ? q.cod.total : q.prepaid.total, facts: {} })
      expect(r.kind).toBe('placed')
      return (await withTenant(A, (tx) => tx.select({ id: orders.id }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.number, r.kind === 'placed' ? r.number : -1)))))[0]!.id
    }

    // COD: both lines taken and stamped at placement; red went to 0.
    const o1 = await place([{ variantId: made.red, qty: 2 }, { variantId: made.blue, qty: 3 }], 'cod')
    expect(await taken(o1)).toEqual([true, true])
    expect(await stock()).toEqual({ red: 0, blue: 6 })
    // Cancelled with the stock put back: exactly what was taken, red named (it came back from 0), the stamps cleared.
    const c1 = await withTenant(A, (tx) => cancel(tx, A, ACTOR, o1, { reason: 'customer_cancelled', restock: true }))
    expect(c1).toMatchObject({ ok: true, refund: 0, backInStock: [made.red] })
    expect(await stock()).toEqual({ red: 2, blue: 9 })
    expect(await taken(o1)).toEqual([false, false])
    // Put back again (a retry, a later outcome): nothing more comes back.
    expect(await withTenant(A, (tx) => putStockBack(tx, A, o1))).toEqual([])
    expect(await stock()).toEqual({ red: 2, blue: 9 })

    // Cancelled without restocking: the pieces stay taken (damaged, or already gone).
    const o2 = await place([{ variantId: made.blue, qty: 1 }], 'cod')
    expect(await stock()).toEqual({ red: 2, blue: 8 })
    expect(await withTenant(A, (tx) => cancel(tx, A, ACTOR, o2, { reason: 'customer_cancelled', restock: false }))).toMatchObject({ ok: true, backInStock: [] })
    expect(await stock()).toEqual({ red: 2, blue: 8 })
    expect(await taken(o2)).toEqual([true])

    // Online and never paid: held, never taken (not an order yet: it cannot be cancelled), so nothing is put back.
    const o3 = await place([{ variantId: made.red, qty: 1 }], 'prepaid')
    expect(await taken(o3)).toEqual([false])
    expect(await withTenant(A, (tx) => cancel(tx, A, ACTOR, o3, { reason: 'customer_cancelled', restock: true }))).toMatchObject({ ok: false })
    expect(await withTenant(A, (tx) => putStockBack(tx, A, o3))).toEqual([])
    expect(await stock()).toEqual({ red: 2, blue: 8 })
  }, 30_000)
})
