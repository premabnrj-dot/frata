// An order's items edited, on a real Postgres (order edit OE·1, docs/plans/2026-11-12-order-edit.md § Tasks 4). A
// throwaway shop made from shop A of the proof (so no other int test meets its offers or stock; skipped unless
// INT_DB_HOST is set, as in CI), its orders placed by the real placeOrder paying on delivery; Razorpay and the cache purge
// stubbed. Each edit is the real write (editItems) at the total the planner shows, and each Undo the real undoEdit:
//  1. a swap and a removal: pieces back and taken per line, lines taken out (never rewritten) with their successor named,
//     the offer giving less as a new use, every money column agreeing, the edit's record, the held email; Undo puts it
//     all back exactly, once;
//  2. a new quantity keeps the price the line was sold at, an added piece is at today's, a piece with no room is refused;
//  3. a race with packing: an edit waiting on the order's lock sees it packed and changes nothing;
//  4. an offer's use is freed by an edit, taken by another order, and Undo is then refused; a tier steps down; free
//     delivery from an offer comes off below its minimum, and the shop's own threshold brings the charge back;
//  5. refused: packed, a support visit, over the COD maximum, a total that moved (paid online: edit-paid.int.test.ts);
//  6. two lines on one variant with too little for both: the line with the lower id is taken, whatever the call order;
//  7. after an edit, every reader reads the live lines: packing's invoice, a cancel that restocks, pre-orders owed, the
//     list's item counts;
//  8. the edited email: sent after its wait; skipped when undone, cancelled, or superseded by a later edit that emails
//     too (never by one saved without the email).
// The shops and their rows stay in the proof database (frata_app deletes no orders); their outbox rows are marked dead.
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { EditReason, Want } from '@/domains/orders/edit'

const HOST = 'kesar-studio.frata.test'
const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'
const ME = '99999999-9999-9999-9999-999999999999'
const ACTOR = { kind: 'member' as const, userId: ME, email: 'int@frata.test' }
const address = (phone: string) => ({ name: 'Int Shopper', phone, addressLine: '12 MG Road', area: 'Vaishali Nagar', landmark: '', pincode: '302021', city: 'Jaipur', state: 'Rajasthan' as const, email: 'shopper@frata.test' })

vi.mock('@/lib/payments/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/razorpay')>()),
  createOrder: async () => ({ ok: true as const, id: `order_INTED${Date.now() % 1_000_000}` }),
  orderPayments: async () => ({ ok: true as const, items: [] }) }))
vi.mock('@/lib/payments/keys', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/keys')>()), canTakeOnline: (k: unknown) => !!k }))
vi.mock('@/lib/queries/addresses', async (orig) => ({ ...(await orig<typeof import('@/lib/queries/addresses')>()), hostApprovedIn: async () => true }))
// The edited email's sender, with SES and the shop's cached look stubbed (Next's cache is not there in a test).
process.env.EMAIL_SHOP_DOMAIN ??= 'mail.frata.test'
const sent: string[] = []
vi.mock('@/lib/email/ses', async (orig) => ({ ...(await orig<typeof import('@/lib/email/ses')>()), sendEmail: async (m: { subject: string }) => { sent.push(m.subject); return { ok: true as const, providerId: `p-${sent.length}` } } }))
vi.mock('@/lib/themes/page-look', async (orig) => ({ ...(await orig<typeof import('@/lib/themes/page-look')>()), themeOf: () => ({ schemes: { paper: { accent: '#1C1917' } } }) }))
vi.mock('@/lib/themes/manifests', async (orig) => ({ ...(await orig<typeof import('@/lib/themes/manifests')>()), manifestsFor: async () => ({}) }))
vi.mock('@/lib/queries/storefront', async (orig) => ({ ...(await orig<typeof import('@/lib/queries/storefront')>()), refreshSoldOut: async () => 'now' as const,
  shopSettingsFor: async () => ({ publishedAt: new Date(), supportEmail: 'help@kesar.test', shopName: 'Int order edit', slug: 'int-ed', host: 'int-ed.frata.test' }), shopLook: async () => null,
  collectionMembers: async (t: string) => (await import('@/lib/db/tenant')).withTenant(t, async (tx) => (await import('@/lib/catalogue/collection-members')).collectionMembersIn(tx, t)) }))

const shops: string[] = []
afterAll(async () => {
  if (!host || !shops.length) return
  const { default: postgres } = await import('postgres')
  const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
  await su`update outbox set dead_at = now(), last_error = 'int test shop' where tenant_id in ${su(shops)} and sent_at is null and dead_at is null`
  await su.end()
})

/** A shop paying on delivery: ₹50 delivery, ₹49 COD fee, GST inside the prices. `free`: the shop's own free-delivery threshold. */
async function shop(o: { free?: number; codMax?: number } = {}) {
  process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
  process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
  const { default: postgres } = await import('postgres')
  const stamp = Date.now()
  const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
  const [{ id: A }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-ed-' + stamp}, 'Int order edit') returning id`
  await su`create temp table ed_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
  await su`update ed_shop set tenant_id = ${A}, published_at = now(), cod_on = true, cod_min = 0, cod_max = ${o.codMax ?? 0}, cod_charge = 4900, shipping_flat = 5000,
    free_shipping_above = ${o.free ?? 0}, cod_blocked_pincodes = '{}', prices_include_gst = true, gstin = '08ABCDE1234F1Z5', gst_scheme = 'regular'`
  await su`insert into shop_settings select * from ed_shop`
  await su.end()
  shops.push(A)

  const { withTenant } = await import('@/lib/db/tenant')
  const { products, variants } = await import('@/lib/db/schema-catalogue')
  const made = await withTenant(A, async (tx) => {
    const p = await tx.insert(products).values([
      { tenantId: A, handle: `kurta-${stamp}`, title: 'Anarkali kurta set', options: ['Size'], status: 'active', hsn: '6211' },
      { tenantId: A, handle: `dupatta-${stamp}`, title: 'Chanderi dupatta', options: ['Colour'], status: 'active', hsn: '6214' },
      { tenantId: A, handle: `coord-${stamp}`, title: 'Linen co-ord', options: ['Size'], status: 'active', hsn: '6211' },
    ]).returning({ id: products.id })
    const v = await tx.insert(variants).values([
      { tenantId: A, productId: p[0]!.id, optionValues: ['M'], price: 249900, stock: 5, unitCost: 90000 },
      { tenantId: A, productId: p[0]!.id, optionValues: ['L'], price: 249900, stock: 2, unitCost: 90000 },
      { tenantId: A, productId: p[0]!.id, optionValues: ['XL'], price: 269900, stock: 0, unitCost: 95000 },
      { tenantId: A, productId: p[1]!.id, optionValues: ['Haldi'], price: 89900, stock: 1, unitCost: 30000 },
      { tenantId: A, productId: p[2]!.id, optionValues: ['M'], price: 319900, stock: 5, unitCost: 120000 },
    ]).returning({ id: variants.id })
    return { kurta: p[0]!.id, m: v[0]!.id, l: v[1]!.id, xl: v[2]!.id, dupatta: v[3]!.id, coord: v[4]!.id }
  })
  return { A, stamp, ...made }
}

async function tools(A: string, stamp: number) {
  const { withTenant } = await import('@/lib/db/tenant')
  const { variants } = await import('@/lib/db/schema-catalogue')
  const { orders, orderLines, orderEvents } = await import('@/lib/db/schema-orders')
  const { orderDiscounts } = await import('@/lib/db/schema-discounts')
  const { placeOrder } = await import('@/lib/orders/place')
  const { editItems, undoEdit } = await import('@/lib/orders/edit')
  const { editFactsIn } = await import('@/lib/orders/edit-facts')
  const { inOrder, planEdit } = await import('@/domains/orders/edit')
  const { quoteData } = await import('@/lib/queries/checkout')
  const { quote } = await import('@/domains/checkout/quote')
  const { and, eq, inArray, isNull, sql } = await import('drizzle-orm')
  let n = 0
  const place = async (bag: { variantId: string; qty: number }[]) => {
    const now = new Date(), d = await quoteData(A, bag.map((b) => b.variantId), now, null, HOST)
    const q = quote(bag, d.rows, d.shop!, now, '302021', { offers: d.offers })
    const r = await placeOrder(A, { host: HOST, idempotencyKey: `ed${stamp}${++n}`.padEnd(22, 'x').slice(0, 22), bag, address: address(`98295${String(stamp).slice(-4)}${n}`), method: 'cod', expectedTotal: q.cod.total, facts: {} })
    if (r.kind !== 'placed') throw new Error(`not placed: ${r.kind}`)
    const [o] = await withTenant(A, (tx) => tx.select({ id: orders.id }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.number, r.number))))
    return { id: o!.id, number: r.number, total: q.cod.total }
  }
  const lines = (id: string) => withTenant(A, (tx) => tx.select().from(orderLines).where(and(eq(orderLines.tenantId, A), eq(orderLines.orderId, id))).orderBy(orderLines.position, orderLines.id))
  const live = async (id: string) => (await lines(id)).filter((l) => !l.removedAt)
  const lineOf = async (id: string, variantId: string) => (await live(id)).find((l) => l.variantId === variantId)!
  /** What the planner shows for this request (the panel's total), from the facts the save reads. */
  const planned = (id: string, want: Want[], reasons: Record<string, EditReason> = {}) => withTenant(A, async (tx) => {
    const f = await editFactsIn(tx, A, id, new Date(), want.flatMap((w) => (w.variantId ? [w.variantId] : [])))
    return planEdit(f!.facts, inOrder(f!.live, want), reasons)
  })
  const edit = async (id: string, want: Want[], reasons: Record<string, EditReason> = {}, o: { expectedTotal?: number; actor?: typeof ACTOR | { kind: 'support'; userId: string; email: string }; notify?: boolean } = {}) => {
    const p = await planned(id, want, reasons)
    const expectedTotal = o.expectedTotal ?? (p.ok ? p.plan.total.after : 0)
    return withTenant(A, (tx) => editItems(tx, A, o.actor ?? ACTOR, id, { want, reasons, notify: o.notify ?? true, expectedTotal }))
  }
  const undo = (eventId: string, now?: Date) => withTenant(A, (tx) => undoEdit(tx, A, ACTOR, eventId, now))
  const stock = (ids: string[]) => withTenant(A, async (tx) => (await tx.select({ id: variants.id, s: variants.stock }).from(variants).where(and(eq(variants.tenantId, A), inArray(variants.id, ids))))
    .reduce<Record<string, number>>((a, v) => ({ ...a, [v.id]: v.s }), {}))
  const money = (id: string) => withTenant(A, async (tx) => {
    const [o] = await tx.select({ subtotal: orders.subtotal, shipping: orders.shipping, cod: orders.codCharge, discount: orders.discount, gst: orders.gstTotal, total: orders.total, net: orders.merchandiseNet, cogs: orders.cogs })
      .from(orders).where(and(eq(orders.tenantId, A), eq(orders.id, id)))
    const ls = await tx.select().from(orderLines).where(and(eq(orderLines.tenantId, A), eq(orderLines.orderId, id), isNull(orderLines.removedAt)))
    const n = (v: unknown) => (v === null ? null : Number(v))
    return { subtotal: n(o!.subtotal), shipping: n(o!.shipping), cod: n(o!.cod), discount: n(o!.discount), gst: n(o!.gst), total: n(o!.total), net: n(o!.net), cogs: n(o!.cogs),
      // What the live lines add up to: every money column agrees.
      sum: { discount: ls.reduce((a, l) => a + Number(l.lineDiscount), 0), net: ls.reduce((a, l) => a + Number(l.taxableValue), 0), subtotal: ls.reduce((a, l) => a + Number(l.unitPrice) * l.qty, 0),
        gst: ls.reduce((a, l) => a + Number(l.gst) + Number(l.chargeGst ?? 0), 0), cogs: ls.reduce((a, l) => a + Number(l.unitCost) * l.qty, 0) } }
  })
  const offers = (id: string) => withTenant(A, (tx) => tx.select({ id: orderDiscounts.id, title: orderDiscounts.title, amount: orderDiscounts.amount, removedAt: orderDiscounts.removedAt })
    .from(orderDiscounts).where(and(eq(orderDiscounts.tenantId, A), eq(orderDiscounts.orderId, id))).orderBy(sql`${orderDiscounts.removedAt} nulls last`, orderDiscounts.id))
  const events = (id: string) => withTenant(A, (tx) => tx.select({ id: orderEvents.id, kind: orderEvents.kind, undoes: orderEvents.undoes }).from(orderEvents).where(and(eq(orderEvents.tenantId, A), eq(orderEvents.orderId, id))))
  return { place, lines, live, lineOf, planned, edit, undo, stock, money, offers, events, withTenant }
}

const agrees = (m: Awaited<ReturnType<Awaited<ReturnType<typeof tools>>['money']>>) => {
  expect(m.discount).toBe(m.sum.discount)
  expect(m.net).toBe(m.sum.net)
  expect(m.subtotal).toBe(m.sum.subtotal)
  expect(m.gst).toBe(m.sum.gst)
  expect(m.cogs).toBe(m.sum.cogs)
  expect(m.total).toBe((m.subtotal as number) - (m.discount as number) + (m.shipping as number) + (m.cod as number))
}

describe.skipIf(!host)('editing an order\'s items', () => {
  it('a swap and a removal, then Undo: per line, never rewritten, every money column agreeing, the offer as a new use', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { discounts } = await import('@/lib/db/schema-discounts')
    const { orderEdits, orderEditLines } = await import('@/lib/db/schema-edits')
    const { outbox } = await import('@/lib/db/schema')
    const { and, eq } = await import('drizzle-orm')
    const at = new Date(Date.now() - 60_000)
    await t.withTenant(s.A, (tx) => tx.insert(discounts).values({ tenantId: s.A, title: 'Festive 10% off', style: 'order_off', percentBps: 1000, startsAt: at, startedAt: at, startedBy: ME, createdBy: ME }))
    const o = await t.place([{ variantId: s.m, qty: 1 }, { variantId: s.dupatta, qty: 1 }, { variantId: s.coord, qty: 1 }])
    expect(await t.stock([s.m, s.l, s.dupatta, s.coord])).toEqual({ [s.m]: 4, [s.l]: 2, [s.dupatta]: 0, [s.coord]: 4 })
    const before = await t.money(o.id)
    const [m, d, c] = [await t.lineOf(o.id, s.m), await t.lineOf(o.id, s.dupatta), await t.lineOf(o.id, s.coord)]
    const want = [{ line: m.id, variantId: s.l, qty: 1 }, { line: c.id, variantId: s.coord, qty: 1 }]

    // A removal needs its reason; the panel's total is the save's.
    expect(await t.edit(o.id, want)).toEqual({ ok: false, error: 'Say why Chanderi dupatta comes out.' })
    const r = await t.edit(o.id, want, { [d.id]: 'out_of_stock' })
    if (!r.ok) throw new Error(r.error)
    expect(r.backInStock).toEqual([s.dupatta])
    expect(await t.stock([s.m, s.l, s.dupatta, s.coord])).toEqual({ [s.m]: 5, [s.l]: 1, [s.dupatta]: 1, [s.coord]: 4 })
    const all = await t.lines(o.id)
    const l = all.find((x) => x.variantId === s.l)!
    expect(all.find((x) => x.id === m.id)).toMatchObject({ removedAt: expect.any(Date), replacedBy: l.id, stockTakenAt: null, qty: 1, unitPrice: m.unitPrice })
    expect(all.find((x) => x.id === d.id)).toMatchObject({ removedAt: expect.any(Date), replacedBy: null, stockTakenAt: null })
    expect(l).toMatchObject({ removedAt: null, stockTakenAt: expect.any(Date), position: m.position, unitCost: 90000, kind: 'in_stock', optionValues: ['L'] })
    const after = await t.money(o.id)
    agrees(after)
    expect(after.total).toBe(r.total)
    expect(after.subtotal).toBe(249900 + 319900)
    // 10% of ₹5,698 = ₹569 now (₹659 placed): the old use comes off, a new one carries the new amount.
    const os = await t.offers(o.id)
    expect(os.map((x) => [x.title, Number(x.amount), !!x.removedAt])).toEqual([['Festive 10% off', 65900, true], ['Festive 10% off', 56900, false]])
    expect(after.discount).toBe(56900)
    const [e] = await t.withTenant(s.A, (tx) => tx.select().from(orderEdits).where(and(eq(orderEdits.tenantId, s.A), eq(orderEdits.eventId, r.eventId))))
    expect(e).toMatchObject({ totalBefore: before.total, totalAfter: after.total, shippingBefore: 5000, shippingAfter: 5000, notify: true, offersRemoved: [os[0]!.id], offersAdded: [os[1]!.id] })
    const sides = await t.withTenant(s.A, (tx) => tx.select().from(orderEditLines).where(and(eq(orderEditLines.tenantId, s.A), eq(orderEditLines.editId, e!.id))))
    expect(sides.filter((x) => x.side === 'before').map((x) => [x.orderLineId, x.reason]).sort()).toEqual([[c.id, null], [d.id, 'out_of_stock'], [m.id, null]].sort())
    expect(sides.filter((x) => x.side === 'after').map((x) => [x.orderLineId, x.replaces]).sort()).toEqual([[c.id, null], [l.id, m.id]].sort())
    expect((await t.events(o.id)).filter((x) => x.kind === 'items_edited').map((x) => x.id)).toEqual([r.eventId])
    // The email waits out the Undo window.
    const [mail] = await t.withTenant(s.A, (tx) => tx.select({ notBefore: outbox.nextAttemptAt }).from(outbox).where(and(eq(outbox.tenantId, s.A), eq(outbox.dedupeKey, `email:edited:${r.eventId}`))))
    expect(mail!.notBefore.getTime() - Date.now()).toBeGreaterThan(9 * 60_000)

    // Undo: the lines, their pieces, the offer and every money column exactly as before; once.
    const u = await t.undo(r.eventId)
    if (!u.ok) throw new Error(u.error)
    expect(await t.stock([s.m, s.l, s.dupatta, s.coord])).toEqual({ [s.m]: 4, [s.l]: 2, [s.dupatta]: 0, [s.coord]: 4 })
    expect((await t.live(o.id)).map((x) => x.id).sort()).toEqual([m.id, d.id, c.id].sort())
    expect((await t.lines(o.id)).find((x) => x.id === m.id)).toMatchObject({ replacedBy: null, stockTakenAt: expect.any(Date) })
    expect(await t.money(o.id)).toEqual(before)
    expect((await t.offers(o.id)).map((x) => [Number(x.amount), !!x.removedAt])).toEqual([[56900, true], [65900, false]])
    expect(await t.undo(r.eventId)).toEqual({ ok: false, error: 'Already undone.' })
    // And it can be edited again afterwards.
    expect((await t.edit(o.id, [{ line: m.id, variantId: s.m, qty: 1 }, { line: d.id, variantId: s.dupatta, qty: 1 }], { [c.id]: 'customer_asked' })).ok).toBe(true)
  }, 60_000)

  it('a new quantity keeps the price it was sold at; an addition is at today\'s; no room is refused; Undo ends after 10 minutes', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { variants } = await import('@/lib/db/schema-catalogue')
    const { and, eq } = await import('drizzle-orm')
    const o = await t.place([{ variantId: s.m, qty: 1 }])
    const m = await t.lineOf(o.id, s.m)
    await t.withTenant(s.A, (tx) => tx.update(variants).set({ price: 279900 }).where(and(eq(variants.tenantId, s.A), eq(variants.id, s.m))))
    const r = await t.edit(o.id, [{ line: m.id, variantId: s.m, qty: 2 }, { line: null, variantId: s.dupatta, qty: 1 }])
    if (!r.ok) throw new Error(r.error)
    const ls = await t.live(o.id)
    expect(ls.map((x) => [x.variantId, x.qty, Number(x.unitPrice)])).toEqual([[s.m, 2, 249900], [s.dupatta, 1, 89900]])
    expect(await t.stock([s.m, s.dupatta])).toEqual({ [s.m]: 3, [s.dupatta]: 0 })
    agrees(await t.money(o.id))
    // XL has none; L has two.
    const two = await t.lineOf(o.id, s.m)
    expect(await t.edit(o.id, [{ line: two.id, variantId: s.xl, qty: 1 }, { line: (await t.lineOf(o.id, s.dupatta)).id, variantId: s.dupatta, qty: 1 }]))
      .toEqual({ ok: false, error: 'Anarkali kurta set · XL is sold out.' })
    expect(await t.edit(o.id, [{ line: two.id, variantId: s.l, qty: 3 }, { line: (await t.lineOf(o.id, s.dupatta)).id, variantId: s.dupatta, qty: 1 }]))
      .toEqual({ ok: false, error: 'Anarkali kurta set · L: only 2 left.' })
    expect(await t.undo(r.eventId, new Date(Date.now() + 11 * 60_000))).toEqual({ ok: false, error: 'The 10 minutes to undo have passed. Edit the items instead.' })
  }, 60_000)

  it('a race with packing: the edit waits for the order\'s lock, then sees it packed and changes nothing', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { confirm, pack } = await import('@/lib/orders/work')
    const o = await t.place([{ variantId: s.m, qty: 1 }, { variantId: s.coord, qty: 1 }])
    await t.withTenant(s.A, (tx) => confirm(tx, s.A, ACTOR, o.id))
    const m = await t.lineOf(o.id, s.m), c = await t.lineOf(o.id, s.coord)
    const want = [{ line: m.id, variantId: s.l, qty: 1 }, { line: c.id, variantId: s.coord, qty: 1 }]
    const expected = await t.planned(o.id, want)
    let packed!: () => void
    const held = new Promise<void>((r) => { packed = r })
    const packing = t.withTenant(s.A, async (tx) => { const p = await pack(tx, s.A, ACTOR, o.id); packed(); await new Promise((r) => setTimeout(r, 400)); return p })
    await held
    const { editItems } = await import('@/lib/orders/edit')
    const editing = t.withTenant(s.A, (tx) => editItems(tx, s.A, ACTOR, o.id, { want, reasons: {}, notify: false, expectedTotal: expected.ok ? expected.plan.total.after : 0 }))
    const [p, r] = await Promise.all([packing, editing])
    expect(p.ok).toBe(true)
    expect(r).toEqual({ ok: false, error: 'Already packed: its slip and invoice keep these items.' })
    expect((await t.live(o.id)).map((x) => x.id).sort()).toEqual([m.id, c.id].sort())
    expect(await t.stock([s.m, s.l])).toEqual({ [s.m]: 4, [s.l]: 2 })
  }, 60_000)

  it('offers: a use freed then taken refuses Undo; a step down; free delivery off below its minimum; the shop\'s threshold', async () => {
    const s = await shop({ free: 500000 })
    const t = await tools(s.A, s.stamp)
    const { discounts, discountTiers } = await import('@/lib/db/schema-discounts')
    const { discountUses } = await import('@/lib/db/discount-predicates')
    const at = new Date(Date.now() - 60_000)
    const started = { startsAt: at, startedAt: at, startedBy: ME, createdBy: ME }
    const [big] = await t.withTenant(s.A, (tx) => tx.insert(discounts).values({ tenantId: s.A, title: 'Big bag ₹500 off', style: 'order_off', amountOff: 50000, minSubtotal: 500000, limitTotal: 1, ...started }).returning({ id: discounts.id }))
    // Placed at ₹8,297: over the shop's free-delivery threshold (₹5,000) and the offer's minimum.
    const x = await t.place([{ variantId: s.m, qty: 1 }, { variantId: s.dupatta, qty: 1 }, { variantId: s.coord, qty: 1 }])
    expect((await t.money(x.id)).shipping).toBe(0)
    expect((await t.offers(x.id)).map((o) => [o.title, Number(o.amount)])).toEqual([['Big bag ₹500 off', 50000]])
    const [m, d, c] = [await t.lineOf(x.id, s.m), await t.lineOf(x.id, s.dupatta), await t.lineOf(x.id, s.coord)]
    // The co-ord comes out: ₹3,398 is under the offer's minimum (it comes off) and the shop's threshold (₹50 delivery back).
    const r = await t.edit(x.id, [{ line: m.id, variantId: s.m, qty: 1 }, { line: d.id, variantId: s.dupatta, qty: 1 }], { [c.id]: 'customer_asked' })
    if (!r.ok) throw new Error(r.error)
    const after = await t.money(x.id)
    agrees(after)
    expect([after.shipping, after.discount, after.total]).toEqual([5000, 0, 249900 + 89900 + 5000 + 4900])
    expect((await t.offers(x.id)).map((o) => !!o.removedAt)).toEqual([true])
    const uses = () => t.withTenant(s.A, async (tx) => (await discountUses(tx, s.A, [big!.id], new Date())).get(big!.id)?.n ?? 0)
    expect(await uses()).toBe(0)
    // Its one use is free: another order takes it. Undo would give it twice: refused, and nothing changes.
    const y = await t.place([{ variantId: s.coord, qty: 2 }])
    expect((await t.offers(y.id)).map((o) => o.title)).toEqual(['Big bag ₹500 off'])
    expect(await t.undo(r.eventId)).toEqual({ ok: false, error: 'Big bag ₹500 off ran out since: Undo would give it again. Edit the items instead.' })
    expect(await t.money(x.id)).toEqual(after)
    expect(await uses()).toBe(1)

    // A tier steps down: 10% from ₹6,000, 5% from ₹3,000.
    const s2 = await shop()
    const t2 = await tools(s2.A, s2.stamp)
    const [steps] = await t2.withTenant(s2.A, (tx) => tx.insert(discounts).values({ tenantId: s2.A, title: 'Steps', style: 'order_off', percentBps: 500, minSubtotal: 300000, ...started }).returning({ id: discounts.id }))
    await t2.withTenant(s2.A, (tx) => tx.insert(discountTiers).values([{ tenantId: s2.A, discountId: steps!.id, minSubtotal: 300000, percentBps: 500 }, { tenantId: s2.A, discountId: steps!.id, minSubtotal: 600000, percentBps: 1000 }]))
    const z = await t2.place([{ variantId: s2.m, qty: 1 }, { variantId: s2.dupatta, qty: 1 }, { variantId: s2.coord, qty: 1 }])
    const [zm, zd, zc] = [await t2.lineOf(z.id, s2.m), await t2.lineOf(z.id, s2.dupatta), await t2.lineOf(z.id, s2.coord)]
    const down = await t2.edit(z.id, [{ line: zm.id, variantId: s2.m, qty: 1 }, { line: zc.id, variantId: s2.coord, qty: 1 }], { [zd.id]: 'other' })
    if (!down.ok) throw new Error(down.error)
    expect((await t2.offers(z.id)).map((o) => [Number(o.amount), !!o.removedAt])).toEqual([[65900, true], [28400, false]])
    agrees(await t2.money(z.id))

    // Free delivery from an offer comes off below its minimum: its waived charge comes back.
    const [ship] = await t2.withTenant(s2.A, (tx) => tx.insert(discounts).values({ tenantId: s2.A, title: 'Free delivery', style: 'free_shipping', minSubtotal: 300000, ...started }).returning({ id: discounts.id }))
    const f = await t2.place([{ variantId: s2.coord, qty: 1 }, { variantId: s2.l, qty: 1 }])
    expect((await t2.money(f.id)).shipping).toBe(0)
    const fl = await t2.lineOf(f.id, s2.l), fc = await t2.lineOf(f.id, s2.coord)
    const off = await t2.edit(f.id, [{ line: fl.id, variantId: s2.l, qty: 1 }], { [fc.id]: 'customer_asked' })
    if (!off.ok) throw new Error(off.error)
    expect((await t2.money(f.id)).shipping).toBe(5000)
    expect((await t2.offers(f.id)).find((o) => o.title === 'Free delivery')!.removedAt).not.toBeNull()
    void ship
  }, 90_000)

  it('refused: packed, a support visit, the COD maximum, a moved total', async () => {
    const s = await shop({ codMax: 600000 })
    const t = await tools(s.A, s.stamp)
    const { orders } = await import('@/lib/db/schema-orders')
    const { and, eq } = await import('drizzle-orm')
    const o = await t.place([{ variantId: s.m, qty: 1 }])
    const m = await t.lineOf(o.id, s.m)
    const swap = [{ line: m.id, variantId: s.l, qty: 1 }]
    expect(await t.edit(o.id, swap, {}, { actor: { kind: 'support', userId: ME, email: 'support@frata.test' } })).toEqual({ ok: false, error: 'A support visit can\'t change an order\'s items.' })
    expect(await t.edit(o.id, swap, {}, { expectedTotal: 1 })).toEqual({ ok: false, error: 'The new total is ₹2,598. Check it, then save again.', total: 259800 })
    expect(await t.edit(o.id, [{ line: m.id, variantId: s.m, qty: 3 }])).toEqual({ ok: false, error: 'Pay on delivery is for orders up to ₹6,000. Ask them to pay online, or keep the order as it was.' })
    // OE·2 lifted the refusals of a paid-online order and of one switched from an online payment: edit-paid.int.test.ts.
    expect((await t.live(o.id)).map((l) => l.id)).toEqual([m.id])
    const p = await t.place([{ variantId: s.coord, qty: 1 }])
    await t.withTenant(s.A, (tx) => tx.update(orders).set({ confirmedAt: new Date(), packedAt: new Date(), invoiceNumber: `ED/${String(s.stamp).slice(-6)}` }).where(and(eq(orders.tenantId, s.A), eq(orders.id, p.id))))
    expect(await t.edit(p.id, [{ line: (await t.lineOf(p.id, s.coord)).id, variantId: s.coord, qty: 2 }], {}, { expectedTotal: 0 })).toEqual({ ok: false, error: 'Already packed: its slip and invoice keep these items.' })
  }, 60_000)

  it('two lines on one variant with too little for both: the lower line id is taken, whatever order they are named in', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { orderLines } = await import('@/lib/db/schema-orders')
    const { variants } = await import('@/lib/db/schema-catalogue')
    const { takeStockLines, putStockBackLines } = await import('@/lib/orders/stock')
    const { and, eq } = await import('drizzle-orm')
    const o = await t.place([{ variantId: s.coord, qty: 1 }])
    const ids = await t.withTenant(s.A, async (tx) => {
      await tx.update(variants).set({ stock: 1 }).where(and(eq(variants.tenantId, s.A), eq(variants.id, s.dupatta)))
      // The higher id first, so the rows' own order would take the wrong one.
      const hi = `ffffffff-${String(s.stamp).slice(-4)}-4000-8000-${String(s.stamp).padStart(12, '0').slice(-12)}`, lo = `00000000-${hi.slice(9)}`
      await tx.insert(orderLines).values([hi, lo].map((id, i) => ({ id, tenantId: s.A, orderId: o.id, variantId: s.dupatta, title: `Dupatta ${i}`, qty: 1, unitPrice: 89900, taxableValue: 80268, position: 10 + i })))
      return [lo, hi]
    })
    for (const named of [ids, [...ids].reverse()]) {
      const got = await t.withTenant(s.A, async (tx) => {
        const r = await takeStockLines(tx, s.A, named)
        const taken = (await tx.select({ id: orderLines.id, at: orderLines.stockTakenAt }).from(orderLines).where(and(eq(orderLines.tenantId, s.A), eq(orderLines.orderId, o.id)))).filter((l) => ids.includes(l.id) && l.at).map((l) => l.id)
        await putStockBackLines(tx, s.A, ids)
        return { r, taken }
      })
      expect(got).toEqual({ r: { short: 1, taken: 1 }, taken: [ids[0]] })
    }
  }, 30_000)

  it('after an edit every reader reads the live lines: the invoice, a cancel that restocks, pre-orders owed, the list', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { variants } = await import('@/lib/db/schema-catalogue')
    const { confirm, pack, cancel } = await import('@/lib/orders/work')
    const { documentsFor } = await import('@/lib/orders/documents')
    const { variantRows } = await import('@/lib/queries/checkout')
    const { listOrders } = await import('@/lib/queries/orders')
    const { and, eq } = await import('drizzle-orm')
    // A pre-order piece: none on the shelf, ships in a month.
    const ships = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    await t.withTenant(s.A, (tx) => tx.update(variants).set({ whenOut: 'preorder', shipsBy: ships }).where(and(eq(variants.tenantId, s.A), eq(variants.id, s.xl))))
    const o = await t.place([{ variantId: s.m, qty: 1 }, { variantId: s.xl, qty: 1 }, { variantId: s.coord, qty: 2 }])
    const owed = async () => (await t.withTenant(s.A, (tx) => variantRows(tx, s.A, [s.xl], new Date()))).map((r) => [r.owed, r.preordered])
    expect(await owed()).toEqual([[1, 1]])
    const [m, xl, c] = [await t.lineOf(o.id, s.m), await t.lineOf(o.id, s.xl), await t.lineOf(o.id, s.coord)]
    const r = await t.edit(o.id, [{ line: m.id, variantId: s.l, qty: 1 }, { line: c.id, variantId: s.coord, qty: 1 }], { [xl.id]: 'customer_asked' })
    if (!r.ok) throw new Error(r.error)
    expect(await owed()).toEqual([[0, 0]])
    const row = (await listOrders(s.A, { tab: 'all', now: new Date() })).find((x) => x.id === o.id)
    expect(row?.items).toBe(2)
    expect(await t.stock([s.m, s.l, s.coord])).toEqual({ [s.m]: 5, [s.l]: 1, [s.coord]: 4 })
    // Packed: the invoice has the two live lines, as they are now.
    await t.withTenant(s.A, async (tx) => { await confirm(tx, s.A, ACTOR, o.id); expect((await pack(tx, s.A, ACTOR, o.id)).ok).toBe(true) })
    const docs = await t.withTenant(s.A, (tx) => documentsFor(tx, s.A, [o.number], 'invoice'))
    expect(docs.orders[0]!.lines.map((l) => [l.optionValues, l.qty])).toEqual([[['L'], 1], [['M'], 1]])
    // Cancelled with its stock put back: exactly what the live lines took (the removed ones gave theirs back already).
    expect((await t.withTenant(s.A, (tx) => cancel(tx, s.A, ACTOR, o.id, { reason: 'customer_cancelled', restock: true }))).ok).toBe(true)
    expect(await t.stock([s.m, s.l, s.coord])).toEqual({ [s.m]: 5, [s.l]: 2, [s.coord]: 5 })
  }, 60_000)

  it('the edited email: sent after its wait, skipped when undone, cancelled or superseded by a later emailing edit', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { outbox } = await import('@/lib/db/schema')
    const { emailMessages, emailShops } = await import('@/lib/db/schema-email')
    const { sendOrderEmail } = await import('@/lib/email/order-sender')
    const { cancel } = await import('@/lib/orders/work')
    const { and, eq } = await import('drizzle-orm')
    await t.withTenant(s.A, (tx) => tx.insert(emailShops).values({ tenantId: s.A, sesReadyAt: new Date() }))
    /** Send the edit's email now (its wait skipped) and say what became of it. */
    const send = async (eventId: string) => {
      const [row] = await t.withTenant(s.A, (tx) => tx.select().from(outbox).where(and(eq(outbox.tenantId, s.A), eq(outbox.dedupeKey, `email:edited:${eventId}`))))
      await sendOrderEmail(row!)
      const [m] = await t.withTenant(s.A, (tx) => tx.select({ sent: emailMessages.sentAt, skip: emailMessages.skipCode }).from(emailMessages).where(and(eq(emailMessages.tenantId, s.A), eq(emailMessages.id, row!.id))))
      return m?.sent ? 'sent' : m?.skip ?? null
    }
    const swap = async (o: string, to: string, notify = true) => { const l = (await t.live(o))[0]!; const r = await t.edit(o, [{ line: l.id, variantId: to, qty: 1 }], {}, { notify }); if (!r.ok) throw new Error(r.error); return r.eventId }
    // A later change saved without the email: the earlier one still tells the shopper.
    const a = await t.place([{ variantId: s.m, qty: 1 }])
    const a1 = await swap(a.id, s.l)
    await swap(a.id, s.m, false)
    expect(await send(a1)).toBe('sent')
    expect(sent.at(-1)).toMatch(/has changed$/)
    // A later change that emails too: the earlier one is superseded, the later one goes.
    const b = await t.place([{ variantId: s.m, qty: 1 }])
    const b1 = await swap(b.id, s.l), b2 = await swap(b.id, s.m)
    expect([await send(b1), await send(b2)]).toEqual(['superseded', 'sent'])
    // Undone, or cancelled since: nothing goes.
    const c = await t.place([{ variantId: s.m, qty: 1 }])
    const c1 = await swap(c.id, s.l)
    expect((await t.undo(c1)).ok).toBe(true)
    expect(await send(c1)).toBe('undone')
    const d = await t.place([{ variantId: s.m, qty: 1 }])
    const d1 = await swap(d.id, s.l)
    await t.withTenant(s.A, (tx) => cancel(tx, s.A, ACTOR, d.id, { reason: 'customer_cancelled', restock: true }))
    expect(await send(d1)).toBe('cancelled')
  }, 60_000)
})
