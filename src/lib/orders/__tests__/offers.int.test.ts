// Offers on a real Postgres (tenant A of the proof; skipped unless INT_DB_HOST is set, as in CI):
//  1. two checkouts race for an offer with one use left — exactly one gets it, the other is told the total changed;
//     the winner's order, lines and order_discounts add up (the discount snapshot, the total CHECK);
//  2. a switch to COD prices the order again from its stored lines and offers — the pay-online saving comes off and a
//     piece crosses back over the GST slab — and a capture after the switch puts it all back, every column at once.
// Test 2 is rolled back; test 1 commits (placeOrder opens its own transactions) and cleans up in `finally`.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const ME = '99999999-9999-9999-9999-999999999999'
const address = (phone: string) => ({ name: 'Int Shopper', phone, addressLine: '12 MG Road', area: 'Vaishali Nagar', landmark: '', pincode: '302021', city: 'Jaipur', state: 'Rajasthan' as const })

describe.skipIf(!host)('offers at placement and after', () => {
  it('a limited offer goes to exactly one of two racing checkouts; what it wrote adds up', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { withTenant } = await import('@/lib/db/tenant')
    const { shopSettings } = await import('@/lib/db/schema')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { discounts, orderDiscounts } = await import('@/lib/db/schema-discounts')
    const { placeOrder } = await import('@/lib/orders/place')
    const { quoteData } = await import('@/lib/queries/checkout')
    const { quote } = await import('@/domains/checkout/quote')
    const { and, eq, inArray, sql } = await import('drizzle-orm')

    const stamp = Date.now()
    const before = await withTenant(A, async (tx) => (await tx.select().from(shopSettings).where(eq(shopSettings.tenantId, A)))[0]!)
    const made = await withTenant(A, async (tx) => {
      await tx.update(shopSettings).set({ publishedAt: new Date(), codOn: true, codMin: 0, codMax: 0, codCharge: 4900, shippingFlat: 0, freeShippingAbove: 0, pricesIncludeGst: true, codBlockedPincodes: [], gstin: '08ABCDE1234F1Z5' })
        .where(eq(shopSettings.tenantId, A))
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-offer-${stamp}`, title: 'Int kurta', options: ['Size'], status: 'active', hsn: '6211' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 280000, stock: 10 }).returning({ id: variants.id })
      const [d] = await tx.insert(discounts).values({ tenantId: A, title: 'One left', style: 'order_off', percentBps: 1500, limitTotal: 1, startsAt: new Date(Date.now() - 60_000),
        startedAt: new Date(), startedBy: ME, createdBy: ME }).returning({ id: discounts.id })
      return { product: p!.id, variant: v!.id, discount: d!.id }
    })
    const placed: string[] = []
    try {
      const bag = [{ variantId: made.variant, qty: 1 }]
      const now = new Date()
      const data = await quoteData(A, [made.variant], now)
      const q = quote(bag, data.rows, data.shop!, now, '302021', { offers: data.offers })
      expect(q.cod.discount).toBe(42000) // 15% of ₹2,800, offered to both before either places
      const key = (n: number) => `int${stamp}${n}`.padEnd(22, 'x').slice(0, 22)
      const [r1, r2] = await Promise.all([1, 2].map((n) => placeOrder(A, { idempotencyKey: key(n), bag, address: address(`98290${String(stamp).slice(-4)}${n}`), method: 'cod', expectedTotal: q.cod.total, facts: {} })))
      const kinds = [r1!.kind, r2!.kind].sort()
      expect(kinds).toEqual(['changed', 'placed'])
      const loser = [r1, r2].find((r) => r!.kind === 'changed')!
      expect(loser.kind === 'changed' && loser.quote.cod.discount).toBe(0) // the offer is gone; the new total says so

      await withTenant(A, async (tx) => {
        const [o] = await tx.select({ id: orders.id, discount: orders.discount, subtotal: orders.subtotal, total: orders.total, gst: orders.gstTotal, net: orders.merchandiseNet })
          .from(orders).where(and(eq(orders.tenantId, A), eq(orders.idempotencyKey, r1!.kind === 'placed' ? key(1) : key(2))))
        placed.push(o!.id)
        expect({ discount: Number(o!.discount), total: Number(o!.total) }).toEqual({ discount: 42000, total: 280000 - 42000 + 4900 })
        const lines = await tx.select({ d: orderLines.lineDiscount, t: orderLines.taxableValue, bps: orderLines.gstBps }).from(orderLines).where(eq(orderLines.orderId, o!.id))
        expect(lines.reduce((a, l) => a + Number(l.d), 0)).toBe(42000)
        expect(lines[0]!.bps).toBe(500) // ₹2,380 a piece after the offer: 5%, where ₹2,800 was 18%
        expect(Number(o!.net)).toBe(lines.reduce((a, l) => a + Number(l.t), 0))
        const used = await tx.select({ cls: orderDiscounts.class, amount: orderDiscounts.amount, title: orderDiscounts.title }).from(orderDiscounts).where(eq(orderDiscounts.orderId, o!.id))
        expect(used).toEqual([{ cls: 'order', amount: 42000, title: 'One left' }])
        // The offer is now full: the quote no longer offers it.
        const again = await quoteData(A, [made.variant], new Date())
        expect(again.offers.map((x) => x.id)).not.toContain(made.discount)
      })
    } finally {
      await withTenant(A, async (tx) => {
        if (placed.length) await tx.update(orders).set({ cancelledAt: sql`now()` }).where(and(eq(orders.tenantId, A), inArray(orders.id, placed)))
        await tx.update(discounts).set({ endedAt: new Date() }).where(and(eq(discounts.tenantId, A), eq(discounts.id, made.discount)))
        await tx.update(products).set({ status: 'archived' }).where(and(eq(products.tenantId, A), eq(products.id, made.product)))
        await tx.update(shopSettings).set({ publishedAt: before.publishedAt, codOn: before.codOn, codMin: before.codMin, codMax: before.codMax, codCharge: before.codCharge,
          shippingFlat: before.shippingFlat, freeShippingAbove: before.freeShippingAbove, pricesIncludeGst: before.pricesIncludeGst, codBlockedPincodes: before.codBlockedPincodes, gstin: before.gstin }).where(eq(shopSettings.tenantId, A))
      })
    }
  })

  it('a switch to COD drops the saving (and the piece goes back to 18%); a capture after it restores every column', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { discounts, orderDiscounts } = await import('@/lib/db/schema-discounts')
    const { markPaid } = await import('@/lib/orders/payment')
    const { storedPricing, writeReprice } = await import('@/lib/orders/reprice')
    const { reprice } = await import('@/domains/orders/amounts')
    const { quote } = await import('@/domains/checkout/quote')
    const { useOfRowSql } = await import('@/lib/db/discount-predicates')
    const { eq, sql } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      const now = new Date()
      const [d] = await tx.insert(discounts).values({ tenantId: A, title: 'Pay online', style: 'pay_online', amountOff: 10000, startsAt: now, startedAt: now, startedBy: ME, createdBy: ME }).returning({ id: discounts.id })
      const terms = { id: d!.id, title: 'Pay online', style: 'pay_online' as const, percentBps: null, amountOff: 10000, cap: null, minSubtotal: 0, combinesWithPayment: true, listed: true, code: null, codeId: null }
      const rules = { shippingFlat: 0, freeShippingAbove: 0, codOn: true, codMin: 0, codMax: 0, codCharge: 4900, pricesIncludeGst: true, registered: true, dispatchDays: 2, metroDays: 2, restDays: 5 }
      const row = { variantId: 'v', productId: 'p', handle: 'h', title: 'Kurta', status: 'active', publishAt: null, options: [], values: [], sku: null, price: 265000, compareAt: null,
        stock: 5, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, held: 0, preordered: 0, owed: 0, hsn: '6211', image: null }
      const q = quote([{ variantId: 'v', qty: 1 }], [row], rules, now, null, { offers: [terms] })
      expect([q.prepaid.lines[0]!.gstBps, q.cod.lines[0]!.gstBps]).toEqual([500, 1800])
      const m = q.prepaid
      const [o] = await tx.insert(orders).values({ tenantId: A, number: 930_001, paymentMethod: 'prepaid', placedAt: now, payBy: new Date(now.getTime() + 600_000),
        subtotal: q.subtotal, discount: m.discount, shipping: 0, codCharge: 0, gstTotal: m.gst, total: m.total, merchandiseNet: m.merchandiseNet, sellerGstin: '08ABCDE1234F1Z5', pricesIncludeGst: true,
        checkout: { onlineTotal: m.total } }).returning({ id: orders.id })
      await tx.insert(orderLines).values({ tenantId: A, orderId: o!.id, title: 'Kurta', qty: 1, unitPrice: 265000, hsn: '6211', position: 0, kind: 'in_stock', stockTakenAt: now,
        lineDiscount: m.lines[0]!.discount, taxableValue: m.lines[0]!.taxable, gstBps: m.lines[0]!.gstBps, gst: m.lines[0]!.gst, chargeTaxable: 0, chargeGst: 0 })
      await tx.insert(orderDiscounts).values({ tenantId: A, orderId: o!.id, discountId: d!.id, class: 'payment', amount: 10000, title: 'Pay online', style: 'pay_online', amountOff: 10000, minSubtotal: 0 })
      const inUse = async () => (await tx.execute<{ n: number }>(sql`select count(*)::int n from order_discounts od join orders o on o.tenant_id = od.tenant_id and o.id = od.order_id
        where od.order_id = ${o!.id} and ${useOfRowSql(new Date())}`))[0]!.n
      expect(await inUse()).toBe(1) // holding: the saving is in use
      const read = async () => {
        const [x] = await tx.select({ total: orders.total, discount: orders.discount, cod: orders.codCharge, gst: orders.gstTotal, net: orders.merchandiseNet }).from(orders).where(eq(orders.id, o!.id))
        const [l] = await tx.select({ d: orderLines.lineDiscount, t: orderLines.taxableValue, bps: orderLines.gstBps, gst: orderLines.gst, ct: orderLines.chargeTaxable, cg: orderLines.chargeGst }).from(orderLines).where(eq(orderLines.orderId, o!.id))
        return { total: Number(x!.total), discount: Number(x!.discount), cod: Number(x!.cod), gst: Number(x!.gst), net: Number(x!.net), line: { d: Number(l!.d), t: Number(l!.t), bps: l!.bps, gst: Number(l!.gst), ct: Number(l!.ct), cg: Number(l!.cg) } }
      }
      const placedAs = await read()

      // The switch, as switchToCod does it: priced again from the stored order, then written whole.
      const sp = await storedPricing(tx, A, o!.id, { shipping: 0, sellerGstin: '08ABCDE1234F1Z5', pricesIncludeGst: true })
      const cod = reprice(sp, 'cod', rules, null).price!
      expect(cod.total).toBe(q.cod.total) // exactly what the checkout showed for COD
      await tx.update(orders).set({ switchedToCodAt: now, payBy: null }).where(eq(orders.id, o!.id))
      await writeReprice(tx, A, o!.id, sp.lineIds, cod)
      const switched = await read()
      expect(switched).toMatchObject({ total: 269900, discount: 0, cod: 4900, line: { d: 0, bps: 1800 } })
      expect(switched.line.t + switched.line.ct).toBe(switched.net + switched.line.ct)
      expect(await inUse()).toBe(0) // switched and unpaid: the saving's use is given back

      // A capture lands after the switch: the shopper paid the online total, so the order is the prepaid one again.
      expect(await markPaid(tx, { id: o!.id, tenantId: A }, { paymentId: 'pay_int_offers' })).toBe('paid')
      expect(await read()).toEqual(placedAs)
      expect(await inUse()).toBe(1)
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
  it('a per-phone limit and a budget each drop the offer for the order that would cross them; liveDiscountSql = offerStatus', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { withTenant } = await import('@/lib/db/tenant')
    const { shopSettings } = await import('@/lib/db/schema')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { orders } = await import('@/lib/db/schema-orders')
    const { discounts } = await import('@/lib/db/schema-discounts')
    const { placeOrder } = await import('@/lib/orders/place')
    const { quoteData } = await import('@/lib/queries/checkout')
    const { quote } = await import('@/domains/checkout/quote')
    const { offerStatus } = await import('@/domains/checkout/offer-status')
    const { liveDiscountSql } = await import('@/lib/db/discount-predicates')
    const { and, eq, inArray, sql } = await import('drizzle-orm')
    const stamp = Date.now()
    const before = await withTenant(A, async (tx) => (await tx.select().from(shopSettings).where(eq(shopSettings.tenantId, A)))[0]!)
    const made = await withTenant(A, async (tx) => {
      await tx.update(shopSettings).set({ publishedAt: new Date(), codOn: true, codMin: 0, codMax: 0, codCharge: 0, shippingFlat: 0, freeShippingAbove: 0, pricesIncludeGst: true, codBlockedPincodes: [], gstin: null })
        .where(eq(shopSettings.tenantId, A))
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-limits-${stamp}`, title: 'Int tee', options: ['Size'], status: 'active' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 100000, stock: 50 }).returning({ id: variants.id })
      const at = new Date(Date.now() - 60_000)
      // ₹100 off, once per phone; and ₹50 off within a ₹75 budget (one use fits, the second would cross it).
      const [perPhone] = await tx.insert(discounts).values({ tenantId: A, title: 'Once each', style: 'order_off', amountOff: 10000, limitPerPhone: 1, startsAt: at, startedAt: at, startedBy: ME, createdBy: ME }).returning({ id: discounts.id })
      const [budget] = await tx.insert(discounts).values({ tenantId: A, title: 'Small budget', style: 'pay_online', amountOff: 5000, budget: 7500, startsAt: at, startedAt: at, startedBy: ME, createdBy: ME, endsAt: null }).returning({ id: discounts.id })
      return { product: p!.id, variant: v!.id, ids: [perPhone!.id, budget!.id] }
    })
    const placed: string[] = []
    try {
      const bag = [{ variantId: made.variant, qty: 1 }]
      const key = (n: number) => `lim${stamp}${n}`.padEnd(22, 'y').slice(0, 22)
      const place = async (n: number, phone: string) => {
        const now = new Date(), data = await quoteData(A, [made.variant], now)
        const q = quote(bag, data.rows, data.shop!, now, '302021', { offers: data.offers })
        const r = await placeOrder(A, { idempotencyKey: key(n), bag, address: address(phone), method: 'cod', expectedTotal: q.cod.total, facts: {} })
        if (r.kind === 'placed') placed.push((await withTenant(A, (tx) => tx.select({ id: orders.id }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.idempotencyKey, key(n))))))[0]!.id)
        return { q, r }
      }
      const phone = `97000${String(stamp).slice(-5)}`
      const first = await place(1, phone)
      expect(first.r.kind).toBe('placed')
      expect(first.q.cod.discount).toBe(10000)
      // The same phone again: the quote cannot know the phone, so it still offers ₹100 — placement drops it ("changed").
      const second = await place(2, phone)
      expect(second.r.kind).toBe('changed')
      expect(second.r.kind === 'changed' && second.r.quote.cod.discount).toBe(0)
      // Another phone: it applies again.
      expect((await place(3, `96000${String(stamp).slice(-5)}`)).q.cod.discount).toBe(10000)

      // The budget, priced exactly as placement does it: one ₹50 use fits ₹75, a second does not.
      await withTenant(A, async (tx) => {
        const { discountUses, fits } = await import('@/lib/db/discount-predicates')
        const u = await discountUses(tx, A, [made.ids[1]!], new Date())
        expect(fits({ limitTotal: null, limitPerPhone: null, budget: 7500 }, u.get(made.ids[1]!), 5000)).toBe(true)
        expect(fits({ limitTotal: null, limitPerPhone: null, budget: 7500 }, { n: 1, given: 5000, phone: 0 }, 5000)).toBe(false)
        // liveDiscountSql agrees with offerStatus() on every shape.
        const now = new Date(), past = new Date(now.getTime() - 3_600_000), future = new Date(now.getTime() + 3_600_000)
        const shapes = [
          { startedAt: null, pausedAt: null, endedAt: null, startsAt: past, endsAt: null },
          { startedAt: past, pausedAt: null, endedAt: null, startsAt: past, endsAt: null },
          { startedAt: past, pausedAt: null, endedAt: null, startsAt: future, endsAt: null },
          { startedAt: past, pausedAt: past, endedAt: null, startsAt: past, endsAt: null },
          { startedAt: past, pausedAt: null, endedAt: past, startsAt: past, endsAt: null },
          { startedAt: past, pausedAt: null, endedAt: null, startsAt: new Date(past.getTime() - 1000), endsAt: past },
        ]
        for (const sh of shapes) {
          const [d] = await tx.insert(discounts).values({ tenantId: A, title: 'Shape', style: 'free_shipping', createdBy: ME, startedBy: sh.startedAt ? ME : null, ...sh }).returning({ id: discounts.id })
          const [r] = await tx.select({ live: sql<boolean>`${liveDiscountSql(now)}` }).from(discounts).where(eq(discounts.id, d!.id))
          expect({ sh, live: r!.live }).toEqual({ sh, live: offerStatus(sh, now) === 'live' })
          await tx.update(discounts).set({ endedAt: now }).where(eq(discounts.id, d!.id))
        }
      })
    } finally {
      await withTenant(A, async (tx) => {
        if (placed.length) await tx.update(orders).set({ cancelledAt: sql`now()` }).where(and(eq(orders.tenantId, A), inArray(orders.id, placed)))
        await tx.update(discounts).set({ endedAt: new Date() }).where(and(eq(discounts.tenantId, A), inArray(discounts.id, made.ids)))
        await tx.update(products).set({ status: 'archived' }).where(and(eq(products.tenantId, A), eq(products.id, made.product)))
        await tx.update(shopSettings).set({ publishedAt: before.publishedAt, codOn: before.codOn, codMin: before.codMin, codMax: before.codMax, codCharge: before.codCharge,
          shippingFlat: before.shippingFlat, freeShippingAbove: before.freeShippingAbove, pricesIncludeGst: before.pricesIncludeGst, codBlockedPincodes: before.codBlockedPincodes, gstin: before.gstin }).where(eq(shopSettings.tenantId, A))
      })
    }
  })
})
