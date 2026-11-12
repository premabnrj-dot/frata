// A paid-online order's items edited, on a real Postgres against a fake Razorpay API (order edit OE·2,
// docs/plans/2026-11-12-order-edit.md § Increase on a paid order, § Razorpay facts that shape OE·2). A throwaway shop made
// from shop A of the proof (skipped unless INT_DB_HOST is set, as in CI); its orders placed online by the real placeOrder
// and paid through the real webhook path (storeRazorpayEvent → processEvents). Razorpay is faked at the HTTP edge
// (fetchWithTimeout), so the real razorpay.ts builds every request: the speed, the receipt and the idempotency header are
// what Razorpay would receive.
//  1. lower: the edit applies, its refund is queued for the end of the Undo window; Undo cancels it (nothing reaches
//     Razorpay); saved again, it is sent after the window: speed normal, receipt and X-Refund-Idempotency = the attempt,
//     the payment's refunds listed first; then the edit has no Undo; a refund Razorpay fails later is tried again as a
//     NEW attempt; too little balance → "not sent" with Try again (the edit stands), and Try again sends it;
//  2. higher: Save waits for the shopper (nothing on the order changes), the new pieces are held off sale, packing and a
//     second edit are refused; "Pay" makes the second Razorpay order once (receipt `${number}-e${id8}`, reused); the
//     signed payment applies the edit (the held pieces become the order's); a later decrease refunds across both
//     payments (a ledger per payment), the newest first;
//  3. Ship without the change frees the held pieces and lets it pack; a capture after it is refunded at once;
//  4. a payment on the ORIGINAL Razorpay order after an edit never marks the edited order paid at the old total;
//  5. a difference under ₹1 is not asked for: the edit applies at once; a payment 6 months old can't be refunded.
import { createHmac } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { EditReason, Want } from '@/domains/orders/edit'

const HOST = 'kesar-studio.frata.test'
const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'
const ME = '99999999-9999-9999-9999-999999999999'
const ACTOR = { kind: 'member' as const, userId: ME, email: 'int@frata.test' }
const SECRET = 'int-paid-secret'
const address = (phone: string) => ({ name: 'Int Shopper', phone, addressLine: '12 MG Road', area: 'Vaishali Nagar', landmark: '', pincode: '302021', city: 'Jaipur', state: 'Rajasthan' as const, email: 'shopper@frata.test' })

/** Razorpay's API as the docs describe it (frata-integrations § Razorpay, 2026-11-12), in memory. */
const rz = vi.hoisted(() => {
  type Refund = { id: string; entity: 'refund'; amount: number; receipt: string; status: 'pending' | 'processed' | 'failed'; payment_id: string; notes: unknown; speed_requested: string }
  const s = {
    orders: new Map<string, { id: string; amount: number; receipt: string }>(), payments: new Map<string, { id: string; order_id: string; amount: number; status: string; currency: string; created_at: number; fee: number; tax: number }>(),
    refunds: [] as Refund[], calls: [] as { method: string; path: string; body: Record<string, unknown>; headers: Record<string, string> }[],
    /** What the next refund create does: refuse for low balance, say another operation is in progress, or accept then fail. */
    next: [] as ('balance' | 'busy' | 'fail_later' | 'down' | 'lost')[], n: 0, hidden: new Set<string>(),
  }
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const handle = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url), method = init.method ?? 'GET', body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    s.calls.push({ method, path: u.pathname + u.search, body, headers: (init.headers ?? {}) as Record<string, string> })
    const p = u.pathname
    if (method === 'GET' && p === '/v1/payments') return answer(200, { items: [] })
    if (method === 'POST' && p === '/v1/orders') {
      if ([...s.orders.values()].some((o) => o.receipt === body.receipt)) return answer(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'Duplicate request' } })
      const o = { id: `order_FAKE${++s.n}x${Date.now() % 100000}`, amount: Number(body.amount), receipt: String(body.receipt) }
      s.orders.set(o.id, o); return answer(200, { ...o, entity: 'order', status: 'created' })
    }
    if (method === 'GET' && p === '/v1/orders') return answer(200, { items: [...s.orders.values()].filter((o) => o.receipt === u.searchParams.get('receipt')) })
    let m = p.match(/^\/v1\/orders\/(order_\w+)\/payments$/)
    if (method === 'GET' && m) return answer(200, { items: [...s.payments.values()].filter((x) => x.order_id === m![1]) })
    m = p.match(/^\/v1\/payments\/(pay_\w+)$/)
    if (method === 'GET' && m) return s.payments.has(m[1]!) ? answer(200, s.payments.get(m[1]!)) : answer(404, { error: { description: 'no such payment' } })
    m = p.match(/^\/v1\/payments\/(pay_\w+)\/refunds$/)
    // `hidden`: a refund Razorpay made but doesn't list yet (its list lags its create).
    if (method === 'GET' && m) return answer(200, { items: s.refunds.filter((r) => r.payment_id === m![1] && !s.hidden.has(r.receipt)) })
    m = p.match(/^\/v1\/payments\/(pay_\w+)\/refunds\/(rfnd_\w+)$/)
    if (method === 'GET' && m) { const r = s.refunds.find((x) => x.id === m![2]); return r ? answer(200, r) : answer(404, {}) }
    m = p.match(/^\/v1\/payments\/(pay_\w+)\/refund$/)
    if (method === 'POST' && m) {
      const pay = s.payments.get(m[1]!)
      if (!pay) return answer(400, { error: { description: 'The id provided does not exist' } })
      const what = s.next.shift()
      if (what === 'balance') return answer(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The merchant does not have enough balance to process the refund' } })
      if (what === 'busy') return answer(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'Another payment operation is in progress' } })
      // No answer: Razorpay never got it ('down'), or made it and the answer was lost ('lost').
      if (what === 'down') return answer(502, {})
      const given = s.refunds.filter((r) => r.payment_id === pay.id && r.status !== 'failed').reduce((a, r) => a + r.amount, 0)
      if (Number(body.amount) > pay.amount - given) return answer(400, { error: { description: 'The refund amount provided is greater than amount captured' } })
      const r: Refund = { id: `rfnd_FAKE${++s.n}x${Date.now() % 100000}`, entity: 'refund', amount: Number(body.amount), receipt: String(body.receipt), status: 'pending', payment_id: pay.id, notes: body.notes, speed_requested: String(body.speed) }
      s.refunds.push(r)
      if (what === 'fail_later') setTimeout(() => { r.status = 'failed' }, 0)
      if (what === 'lost') return answer(502, {})
      return answer(200, r)
    }
    return answer(404, { error: { description: `fake: no route ${method} ${p}` } })
  }
  /** The shopper pays a Razorpay order: a captured payment, and its signature as Checkout returns it. */
  const pay = (orderId: string, secret: string, amount?: number, createdAt = Date.now()) => {
    const o = s.orders.get(orderId)!
    const x = { id: `pay_FAKE${++s.n}x${Date.now() % 100000}`, order_id: orderId, amount: amount ?? o.amount, status: 'captured', currency: 'INR', created_at: Math.floor(createdAt / 1000), fee: 1180, tax: 180 }
    s.payments.set(x.id, x)
    return { payment: x, signature: (globalThis as unknown as { __sign: (k: string, d: string) => string }).__sign(secret, `${orderId}|${x.id}`) }
  }
  return { s, handle, pay }
})
;(globalThis as unknown as { __sign: (k: string, d: string) => string }).__sign = (k, d) => createHmac('sha256', k).update(d).digest('hex')

vi.mock('@/lib/http/timeout', async (orig) => ({ ...(await orig<typeof import('@/lib/http/timeout')>()), fetchWithTimeout: (url: string, init?: RequestInit) => rz.handle(String(url), init) }))
vi.mock('@/lib/payments/keys', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/keys')>()), canTakeOnline: (k: unknown) => !!k }))
vi.mock('@/lib/queries/addresses', async (orig) => ({ ...(await orig<typeof import('@/lib/queries/addresses')>()), hostApprovedIn: async () => true }))
vi.mock('@/lib/queries/storefront', async (orig) => ({ ...(await orig<typeof import('@/lib/queries/storefront')>()), refreshSoldOut: async () => 'now' as const,
  collectionMembers: async (t: string) => (await import('@/lib/db/tenant')).withTenant(t, async (tx) => (await import('@/lib/catalogue/collection-members')).collectionMembersIn(tx, t)) }))

const shops: string[] = []
afterAll(async () => {
  if (!host || !shops.length) return
  const { default: postgres } = await import('postgres')
  const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
  await su`update outbox set dead_at = now(), last_error = 'int test shop' where tenant_id in ${su(shops)} and sent_at is null and dead_at is null`
  await su.end()
})

/** A shop taking payments online and on delivery: ₹50 delivery, ₹49 COD fee, GST inside the prices, its keys saved. */
async function shop() {
  process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
  process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
  const { default: postgres } = await import('postgres')
  const stamp = Date.now()
  const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
  const [{ id: A }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-ep-' + stamp}, 'Int paid edit') returning id`
  await su`create temp table ep_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
  await su`update ep_shop set tenant_id = ${A}, published_at = now(), cod_on = true, cod_min = 0, cod_max = 0, cod_charge = 4900, shipping_flat = 5000,
    free_shipping_above = 0, cod_blocked_pincodes = '{}', prices_include_gst = true, gstin = '08ABCDE1234F1Z5', gst_scheme = 'regular', order_prefix = 'EP'`
  await su`insert into shop_settings select * from ep_shop`
  await su.end()
  shops.push(A)
  const { withTenant } = await import('@/lib/db/tenant')
  const { products, variants } = await import('@/lib/db/schema-catalogue')
  const { saveKeys } = await import('@/lib/payments/keys')
  const made = await withTenant(A, async (tx) => {
    await saveKeys(tx, A, { keyId: 'rzp_test_INTPAIDEDIT01', keySecret: SECRET })
    const p = await tx.insert(products).values([
      { tenantId: A, handle: `kurta-${stamp}`, title: 'Block-print kurta', options: ['Size'], status: 'active', hsn: '6211' },
      { tenantId: A, handle: `coord-${stamp}`, title: 'Linen co-ord', options: ['Size'], status: 'active', hsn: '6211' },
    ]).returning({ id: products.id })
    const v = await tx.insert(variants).values([
      { tenantId: A, productId: p[0]!.id, optionValues: ['S'], price: 189900, stock: 5, unitCost: 70000 },
      // Fifty paise more than S (a difference under Razorpay's ₹1 minimum).
      { tenantId: A, productId: p[0]!.id, optionValues: ['M'], price: 189950, stock: 5, unitCost: 70000 },
      { tenantId: A, productId: p[1]!.id, optionValues: ['M'], price: 238100, stock: 5, unitCost: 90000 },
      { tenantId: A, productId: p[1]!.id, optionValues: ['L'], price: 288000, stock: 2, unitCost: 95000 },
    ]).returning({ id: variants.id })
    return { s: v[0]!.id, m: v[1]!.id, coordM: v[2]!.id, coordL: v[3]!.id }
  })
  return { A, stamp, ...made }
}

async function tools(A: string, stamp: number) {
  const { withTenant } = await import('@/lib/db/tenant')
  const { orders, orderLines } = await import('@/lib/db/schema-orders')
  const { orderEdits, orderEditLines, orderRefunds } = await import('@/lib/db/schema-edits')
  const { outbox } = await import('@/lib/db/schema')
  const { variants } = await import('@/lib/db/schema-catalogue')
  const { placeOrder } = await import('@/lib/orders/place')
  const { storeRazorpayEvent, processEvents } = await import('@/lib/orders/payment')
  const { editItems, undoEdit } = await import('@/lib/orders/edit')
  const { editFactsIn } = await import('@/lib/orders/edit-facts')
  const { inOrder, planEdit } = await import('@/domains/orders/edit')
  const { dueOf, settleOf } = await import('@/domains/orders/refunds')
  const { tokenHash } = await import('@/lib/crypto/secret-box')
  const { quoteData, variantRows } = await import('@/lib/queries/checkout')
  const { quote } = await import('@/domains/checkout/quote')
  const { and, asc, eq, isNull } = await import('drizzle-orm')
  let n = 0
  /** Placed online and paid (the webhook's capture, applied). */
  const paidOrder = async (bag: { variantId: string; qty: number }[], o: { pay?: boolean; fee?: boolean } = {}) => {
    const now = new Date(), d = await quoteData(A, bag.map((b) => b.variantId), now, null, HOST)
    const q = quote(bag, d.rows, d.shop!, now, '302021', { offers: d.offers })
    const r = await placeOrder(A, { host: HOST, idempotencyKey: `ep${stamp}${++n}`.padEnd(22, 'x').slice(0, 22), bag, address: address(`98296${String(stamp).slice(-4)}${n}`), method: 'prepaid', expectedTotal: q.prepaid.total, facts: {} })
    if (r.kind !== 'placed' || !r.pay) throw new Error(`not placed: ${r.kind}`)
    if (o.pay !== false) await capture(r.pay.razorpayOrderId, undefined, undefined, { fee: o.fee })
    const [x] = await withTenant(A, (tx) => tx.select({ id: orders.id }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.number, r.number))))
    return { id: x!.id, number: r.number, total: q.prepaid.total, rzp: r.pay.razorpayOrderId, hash: tokenHash(r.token) }
  }
  /** Razorpay's webhook for a capture: stored first, then applied (as every capture). */
  const capture = async (rzpOrderId: string, amount?: number, createdAt?: number, o: { fee?: boolean } = {}) => {
    const { payment } = rz.pay(rzpOrderId, SECRET, amount, createdAt)
    // Without its fee: as the browser's signed reply is stored (the webhook brings the fee later).
    const { fee: _f, tax: _t, ...bare } = payment
    await storeRazorpayEvent(A, `razorpay:${o.fee === false ? 'checkout.signed' : 'payment.captured'}:${payment.id}`, { event: 'payment.captured', payload: { payment: { entity: o.fee === false ? bare : payment } } })
    await processEvents(A)
    return payment
  }
  const live = (id: string) => withTenant(A, (tx) => tx.select().from(orderLines).where(and(eq(orderLines.tenantId, A), eq(orderLines.orderId, id), isNull(orderLines.removedAt))).orderBy(asc(orderLines.position)))
  const lineOf = async (id: string, v: string) => (await live(id)).find((l) => l.variantId === v)!
  /** Save as the panel would: the total and the refund or payment it shows. */
  const edit = async (id: string, want: Want[], reasons: Record<string, EditReason> = {}, o: { now?: Date } = {}) => {
    const now = o.now ?? new Date()
    const plan = await withTenant(A, async (tx) => {
      const f = await editFactsIn(tx, A, id, now, want.flatMap((w) => (w.variantId ? [w.variantId] : [])))
      const r = planEdit(f!.facts, inOrder(f!.live, want), reasons)
      return r.ok ? { total: r.plan.total.after, due: f!.facts.paid ? dueOf(settleOf(r.plan.total.after, f!.facts.paid, now)) : undefined } : { total: 0, due: undefined }
    })
    return withTenant(A, (tx) => editItems(tx, A, ACTOR, id, { want, reasons, notify: true, expectedTotal: plan.total, ...(plan.due !== undefined ? { expectedDue: plan.due } : {}) }, now))
  }
  const order = async (id: string) => (await withTenant(A, (tx) => tx.select().from(orders).where(and(eq(orders.tenantId, A), eq(orders.id, id)))))[0]!
  const refunds = (id: string) => withTenant(A, (tx) => tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, A), eq(orderRefunds.orderId, id))).orderBy(asc(orderRefunds.createdAt)))
  const edits = (id: string) => withTenant(A, (tx) => tx.select().from(orderEdits).where(and(eq(orderEdits.tenantId, A), eq(orderEdits.orderId, id))).orderBy(asc(orderEdits.createdAt)))
  const outboxRow = async (kind: string, key: string) => (await withTenant(A, (tx) => tx.select().from(outbox).where(and(eq(outbox.tenantId, A), eq(outbox.kind, kind), eq(outbox.dedupeKey, key)))))[0]
  const free = (v: string) => withTenant(A, async (tx) => { const [r] = await variantRows(tx, A, [v], new Date()); return { stock: r!.stock, held: r!.held } })
  const stock = async (v: string) => (await withTenant(A, (tx) => tx.select({ s: variants.stock }).from(variants).where(and(eq(variants.tenantId, A), eq(variants.id, v)))))[0]!.s
  const undo = (eventId: string, now?: Date) => withTenant(A, (tx) => undoEdit(tx, A, ACTOR, eventId, now))
  /** The pieces a change's lines still hold (the column itself, not only what checkout reads from it). */
  const heldOn = async (editId: string) => (await withTenant(A, (tx) => tx.select({ held: orderEditLines.held }).from(orderEditLines).where(and(eq(orderEditLines.tenantId, A), eq(orderEditLines.editId, editId)))))
    .reduce((a, r) => a + r.held, 0)
  return { withTenant, paidOrder, capture, live, lineOf, edit, order, refunds, edits, outboxRow, free, stock, undo, heldOn }
}

const refundCalls = () => rz.s.calls.filter((c) => c.method === 'POST' && /\/refund$/.test(c.path))

describe.skipIf(!host)('editing a paid-online order (OE·2)', () => {
  it('lower: refunded after the Undo window (Undo cancels it), normal speed, receipt and key; failed → a new attempt; low balance → Try again', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { sendRefund, sendRefundCheck, retryRefund } = await import('@/lib/payments/refunds')
    const { undoUntil } = await import('@/domains/orders/edit')
    const o = await t.paidOrder([{ variantId: s.s, qty: 1 }, { variantId: s.coordM, qty: 1 }])
    const paid = await t.order(o.id)
    expect(paid.paidAt).not.toBeNull()
    expect(Number(paid.total)).toBe(189900 + 238100 + 5000)
    const kurta = await t.lineOf(o.id, s.s), coord = await t.lineOf(o.id, s.coordM)
    const keep = [{ line: coord.id, variantId: s.coordM, qty: 1 }]

    // Saved: the edit applies at once and its refund waits for the end of the Undo window.
    const saved = await t.edit(o.id, keep, { [kurta.id]: 'out_of_stock' })
    if (!saved.ok) throw new Error(saved.error)
    expect(saved).toMatchObject({ total: 238100 + 5000, refund: 189900 })
    expect(Number((await t.order(o.id)).total)).toBe(243100)
    const [r1] = await t.refunds(o.id)
    expect(r1).toMatchObject({ cause: 'edit', amount: 189900, razorpayPaymentId: paid.razorpayPaymentId, sendingAt: null })
    expect(Math.abs(r1!.notBefore.getTime() - undoUntil(new Date()).getTime())).toBeLessThan(30_000)
    // Undo inside the window: the refund is cancelled in the Undo's transaction; the sender then sends nothing.
    const undone = await t.undo(saved.eventId)
    expect(undone.ok).toBe(true)
    expect(Number((await t.order(o.id)).total)).toBe(paid.total)
    expect((await t.refunds(o.id))[0]!.cancelledAt).not.toBeNull()
    expect((await t.outboxRow('refund.send', `refund.send:${r1!.id}`))!.deadAt).not.toBeNull()
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${r1!.id}`))!)
    expect(refundCalls()).toHaveLength(0)

    // Saved again and sent after the window: listed first, then created at normal speed, receipt and key = the attempt.
    const kurta2 = await t.lineOf(o.id, s.s)
    const again = await t.edit(o.id, keep, { [kurta2.id]: 'customer_asked' })
    if (!again.ok) throw new Error(again.error)
    const r2 = (await t.refunds(o.id)).find((r) => !r.cancelledAt)!
    const before = rz.s.calls.length
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${r2.id}`))!)
    const sent = rz.s.calls.slice(before)
    expect(sent.map((c) => `${c.method} ${c.path.replace(/pay_\w+/, 'pay')}`)).toEqual(['GET /v1/payments/pay/refunds?count=100', 'GET /v1/payments/pay', 'POST /v1/payments/pay/refund'])
    const post = sent[2]!
    expect(post.body).toMatchObject({ amount: 189900, speed: 'normal', receipt: r2.id, notes: { order: String(o.number), edit: (await t.edits(o.id))[1]!.id, cause: 'edit' } })
    expect(post.headers['X-Refund-Idempotency']).toBe(r2.id)
    const r2s = (await t.refunds(o.id)).find((r) => r.id === r2.id)!
    expect(r2s.sentAt).not.toBeNull()
    expect(r2s.razorpayRefundId).toMatch(/^rfnd_/)
    // Sent: the edit has no Undo now, even inside its 10 minutes.
    expect(await t.undo(again.eventId)).toEqual({ ok: false, error: 'The refund has gone to Razorpay: this change can\'t be undone.' })
    // A second run of the same row finds it by its receipt and sends nothing twice.
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${r2.id}`))!)
    expect(refundCalls()).toHaveLength(1)
    // Razorpay's word read back: processed.
    rz.s.refunds.find((x) => x.receipt === r2.id)!.status = 'processed'
    await sendRefundCheck((await t.outboxRow('refund.check', `refund.check:${r2.id}`))!)
    expect((await t.refunds(o.id)).find((r) => r.id === r2.id)!.processedAt).not.toBeNull()

    // Another order: Razorpay accepts, then fails it → tried again by itself as a NEW attempt (a new receipt and key).
    const o2 = await t.paidOrder([{ variantId: s.s, qty: 2 }])
    const l2 = await t.lineOf(o2.id, s.s)
    const down = await t.edit(o2.id, [{ line: l2.id, variantId: s.s, qty: 1 }])
    if (!down.ok) throw new Error(down.error)
    const [f1] = await t.refunds(o2.id)
    rz.s.next.push('fail_later')
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${f1!.id}`))!)
    await new Promise((r) => setTimeout(r, 5))
    // Two checks reading it pending at once (security pass 3 M1): one failure, one retry — never two.
    const check = (await t.outboxRow('refund.check', `refund.check:${f1!.id}`))!
    await Promise.all([sendRefundCheck(check), sendRefundCheck(check)])
    // The claim's settle check leaves a refund Razorpay gave an id to its own check.
    await sendRefundCheck((await t.outboxRow('refund.check', `refund.settle:${f1!.id}`))!)
    const chain = await t.refunds(o2.id)
    expect(chain).toHaveLength(2)
    expect(chain[0]).toMatchObject({ failure: 'failed' })
    expect(chain[1]).toMatchObject({ retryOf: f1!.id, amount: 189900, failedAt: null })
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${chain[1]!.id}`))!)
    expect(refundCalls().at(-1)!.headers['X-Refund-Idempotency']).toBe(chain[1]!.id)

    // Too little balance: "not sent" with its cause; the edit stands; Try again sends a new attempt.
    const o3 = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
    const l3 = await t.lineOf(o3.id, s.coordM)
    const d3 = await t.edit(o3.id, [{ line: l3.id, variantId: s.coordM, qty: 1 }])
    if (!d3.ok) throw new Error(d3.error)
    const [b1] = await t.refunds(o3.id)
    rz.s.next.push('balance')
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${b1!.id}`))!)
    expect((await t.refunds(o3.id))[0]).toMatchObject({ failure: 'balance', sentAt: null })
    expect((await t.refunds(o3.id))).toHaveLength(1)
    expect((await t.live(o3.id))[0]!.qty).toBe(1)
    // Razorpay busy: waits without spending the attempt.
    const retried = await t.withTenant(s.A, (tx) => retryRefund(tx, s.A, b1!.id, new Date()))
    expect(retried).toEqual({ ok: true })
    expect(await t.withTenant(s.A, (tx) => retryRefund(tx, s.A, b1!.id, new Date()))).toEqual({ ok: false, error: 'Already being tried again.' })
    const b2 = (await t.refunds(o3.id))[1]!
    rz.s.next.push('busy')
    await expect(sendRefund((await t.outboxRow('refund.send', `refund.send:${b2.id}`))!)).rejects.toMatchObject({ name: 'Later' })
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${b2.id}`))!)
    expect((await t.refunds(o3.id))[1]).toMatchObject({ retryOf: b1!.id, failure: null })
    expect((await t.refunds(o3.id))[1]!.sentAt).not.toBeNull()
  }, 120_000)

  it('higher: waits for the shopper (held, no packing, no second edit), paid through a second order, then applied; a later decrease refunds across both payments', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { startEditPayment, editReplyEvent } = await import('@/lib/orders/edit-paid')
    const { storeRazorpayEvent, processEvents } = await import('@/lib/orders/payment')
    const { pack } = await import('@/lib/orders/work')
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 1 }])
    const line = await t.lineOf(o.id, s.coordM)
    const before = await t.free(s.coordL)
    // M → L: ₹498.99 more.
    const asked = await t.edit(o.id, [{ line: line.id, variantId: s.coordL, qty: 1 }])
    if (!asked.ok) throw new Error(asked.error)
    expect(asked).toMatchObject({ asked: 288000 - 238100, total: o.total })
    // Nothing on the order changed; the new piece is held, not taken.
    expect((await t.live(o.id)).map((l) => l.variantId)).toEqual([s.coordM])
    expect(Number((await t.order(o.id)).total)).toBe(o.total)
    expect(await t.free(s.coordL)).toEqual({ stock: before.stock, held: before.held + 1 })
    expect(await t.withTenant(s.A, (tx) => pack(tx, s.A, ACTOR, o.id))).toEqual({ ok: false, error: 'Waiting for ₹499 from the shopper. Ship without the change to pack it as it was.' })
    expect(await t.edit(o.id, [{ line: line.id, variantId: s.coordM, qty: 2 }])).toEqual({ ok: false, error: 'Waiting for the shopper to pay for the last change. Wait, or ship without the change.' })

    // Still waiting after 24 hours: one Notice to the shop, worded from the edit (the definer writes it once).
    const [e] = await t.edits(o.id)
    const { sendEditReminder } = await import('@/lib/orders/edit-paid')
    const { wordNotices } = await import('@/lib/queries/notices')
    const { notices } = await import('@/lib/db/schema-email')
    const { and, eq } = await import('drizzle-orm')
    const remind = (await t.outboxRow('edit.remind', `edit.remind:${e!.id}`))!
    await sendEditReminder(remind)
    const noticesOf = () => t.withTenant(s.A, (tx) => tx.select().from(notices).where(and(eq(notices.tenantId, s.A), eq(notices.sourceKind, 'edit_payment'))))
    expect(await noticesOf()).toHaveLength(0)
    const { default: postgres } = await import('postgres')
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    await su`update order_edits set created_at = now() - interval '25 hours' where id = ${e!.id}`
    await su.end()
    await sendEditReminder(remind)
    await sendEditReminder(remind)
    const [n] = await noticesOf()
    expect(await noticesOf()).toHaveLength(1)
    expect(n).toMatchObject({ type: 'needs_you', sourceId: e!.id, href: `/console/orders/${o.number}` })
    expect([...(await t.withTenant(s.A, (tx) => wordNotices(tx, [n!], 'Int paid edit'))).values()][0]).toEqual({ title: `Order EP-${o.number} is waiting for ₹499`, body: 'Send the payment link again, or ship without the change.' })

    // Pay: the second Razorpay order, receipt `${number}-e${id8}`, made once and reused.
    const start = await startEditPayment(s.A, o.hash)
    if (!start.ok) throw new Error(start.error)
    expect(start.pay.amount).toBe(49900)
    expect(rz.s.orders.get(start.pay.razorpayOrderId)!.receipt).toBe(`${o.number}-e${e!.id.slice(0, 8)}`)
    const posts = rz.s.calls.filter((c) => c.method === 'POST' && c.path === '/v1/orders').length
    expect(await startEditPayment(s.A, o.hash)).toMatchObject({ ok: true, pay: { razorpayOrderId: start.pay.razorpayOrderId } })
    expect(rz.s.calls.filter((c) => c.method === 'POST' && c.path === '/v1/orders').length).toBe(posts)
    // Razorpay is asked too, in case the reply and the webhook are both lost.
    expect(await t.outboxRow('edit.payment', `edit.payment:${e!.id}`)).toBeTruthy()
    // A signature for any other order is refused; ours is checked with OUR stored second order id.
    const { payment, signature } = rz.pay(start.pay.razorpayOrderId, SECRET)
    expect(await editReplyEvent(s.A, o.hash, { paymentId: payment.id, signature: '0'.repeat(64) })).toBeNull()
    const ev = await editReplyEvent(s.A, o.hash, { paymentId: payment.id, signature })
    expect(ev).not.toBeNull()
    await storeRazorpayEvent(s.A, ev!.key, ev!.payload)
    await processEvents(s.A)
    // Applied: the held piece became the order's, the line swapped, the new total, the edit's record filled in.
    expect((await t.live(o.id)).map((l) => l.variantId)).toEqual([s.coordL])
    expect(Number((await t.order(o.id)).total)).toBe(288000 + 5000)
    expect(await t.free(s.coordL)).toEqual({ stock: before.stock - 1, held: before.held })
    const [paidEdit] = await t.edits(o.id)
    expect(paidEdit).toMatchObject({ razorpayPaymentId: payment.id, droppedAt: null })
    expect(await t.heldOn(paidEdit!.id)).toBe(0)
    expect(paidEdit!.paidAt).not.toBeNull()
    // The webhook for the same payment later: its fee is news, once.
    const feeBefore = Number((await t.order(o.id)).gatewayFee ?? 0)
    await storeRazorpayEvent(s.A, `razorpay:payment.captured:${payment.id}`, { event: 'payment.captured', payload: { payment: { entity: payment } } })
    await processEvents(s.A)
    expect(Number((await t.order(o.id)).gatewayFee)).toBe(feeBefore + payment.fee)
    expect((await t.edits(o.id))[0]!.gatewayFee).toBe(payment.fee)
    // A second payment on the same change's Razorpay order (L2): not the order's — refunded in full, once, its fee kept
    // once, the order as it was.
    const totalPaid = Number((await t.order(o.id)).total), linesPaid = (await t.live(o.id)).map((l) => [l.variantId, l.qty])
    const extra = await t.capture(start.pay.razorpayOrderId)
    await storeRazorpayEvent(s.A, `razorpay:order.paid:${extra.id}`, { event: 'order.paid', payload: { payment: { entity: extra } } })
    await processEvents(s.A)
    expect((await t.refunds(o.id)).filter((r) => r.razorpayPaymentId === extra.id).map((r) => [r.cause, Number(r.amount), Number(r.gatewayFee)])).toEqual([['after_drop', 49900, extra.fee]])
    expect(Number((await t.order(o.id)).gatewayFee)).toBe(feeBefore + payment.fee + extra.fee)
    expect([Number((await t.order(o.id)).total), (await t.live(o.id)).map((l) => [l.variantId, l.qty])]).toEqual([totalPaid, linesPaid])

    // A later decrease below what the second payment carries: refunded from both, the newest first (a ledger per payment).
    const l = await t.lineOf(o.id, s.coordL)
    const swapBack = await t.edit(o.id, [{ line: null, variantId: s.s, qty: 1 }], { [l.id]: 'customer_asked' })
    if (!swapBack.ok) throw new Error(swapBack.error)
    const parts = (await t.refunds(o.id)).filter((r) => r.cause === 'edit').map((r) => [r.razorpayPaymentId, Number(r.amount)])
    const first = (await t.order(o.id)).razorpayPaymentId
    // The newest payment gives all it has; the first the rest (both written in one transaction: compared as a set).
    expect(new Map(parts as [string, number][])).toEqual(new Map([[payment.id, 49900], [first!, 293000 - 49900 - (189900 + 5000)]]))
  }, 120_000)

  it('Ship without the change frees the held pieces and packs; a capture after it is refunded at once', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { dropRequest, startEditPayment } = await import('@/lib/orders/edit-paid')
    const { pack } = await import('@/lib/orders/work')
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 1 }])
    const line = await t.lineOf(o.id, s.coordM)
    const held0 = (await t.free(s.coordL)).held
    const asked = await t.edit(o.id, [{ line: line.id, variantId: s.coordL, qty: 1 }])
    if (!asked.ok) throw new Error(asked.error)
    const start = await startEditPayment(s.A, o.hash)
    if (!start.ok) throw new Error(start.error)
    expect((await t.free(s.coordL)).held).toBe(held0 + 1)
    const dropped = await t.withTenant(s.A, (tx) => dropRequest(tx, s.A, ACTOR, o.id))
    expect(dropped).toMatchObject({ ok: true, backInStock: [s.coordL] })
    expect((await t.free(s.coordL)).held).toBe(held0)
    expect((await t.edits(o.id))[0]).toMatchObject({ droppedReason: 'ship_without', paidAt: null })
    expect(await t.heldOn((await t.edits(o.id))[0]!.id)).toBe(0)
    expect(await t.withTenant(s.A, (tx) => dropRequest(tx, s.A, { kind: 'support', userId: ME, email: 's@frata.test' }, o.id))).toMatchObject({ ok: false })
    // The shopper pays anyway (the page was open): recorded, refunded at once in full, the order as it was.
    const late = await t.capture(start.pay.razorpayOrderId)
    expect((await t.live(o.id)).map((l) => l.variantId)).toEqual([s.coordM])
    expect((await t.refunds(o.id)).map((r) => [r.cause, r.razorpayPaymentId, Number(r.amount)])).toEqual([['after_drop', late.id, 49900]])
    expect((await t.refunds(o.id))[0]!.notBefore.getTime()).toBeLessThanOrEqual(Date.now())
    // A second delivery of the same capture queues nothing more.
    await t.capture(start.pay.razorpayOrderId).catch(() => null)
    expect((await t.refunds(o.id)).filter((r) => r.razorpayPaymentId === late.id)).toHaveLength(1)
    const packed = await t.withTenant(s.A, (tx) => pack(tx, s.A, ACTOR, o.id))
    expect(packed.ok).toBe(true)
  }, 120_000)

  it('a payment on the original Razorpay order after an edit never marks the edited order paid at the old total', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { switchToCod } = await import('@/lib/orders/payment')
    const { quoteData } = await import('@/lib/queries/checkout')
    const { quote } = await import('@/domains/checkout/quote')
    // Placed online, not paid, switched to pay on delivery: its Razorpay order can still be paid.
    const o = await t.paidOrder([{ variantId: s.s, qty: 2 }], { pay: false })
    const d = await quoteData(s.A, [s.s], new Date(), null, HOST)
    const q = quote([{ variantId: s.s, qty: 2 }], d.rows, d.shop!, new Date(), '302021', { offers: d.offers })
    expect(await switchToCod(s.A, o.hash, q.cod.total)).toEqual({ kind: 'switched', total: q.cod.total })
    const line = await t.lineOf(o.id, s.s)
    const edited = await t.edit(o.id, [{ line: line.id, variantId: s.s, qty: 1 }])
    if (!edited.ok) throw new Error(edited.error)
    expect(edited).not.toHaveProperty('refund')
    const total = Number((await t.order(o.id)).total)
    // The shopper pays the old online total on the first Razorpay order.
    const p = await t.capture(o.rzp)
    const after = await t.order(o.id)
    expect(after.paidAt).toBeNull()
    expect(Number(after.total)).toBe(total)
    expect((await t.live(o.id))[0]!.qty).toBe(1)
    expect((await t.refunds(o.id)).map((r) => [r.cause, r.razorpayPaymentId, Number(r.amount), r.editId])).toEqual([['old_order', p.id, o.total, null]])
    // Razorpay keeps its fee on it: once, on the refund and the order (profit per order counts it).
    expect([Number((await t.refunds(o.id))[0]!.gatewayFee), Number(after.gatewayFee)]).toEqual([p.fee, p.fee])
    // The payment check asks Razorpay too: the order is not paid by that payment.
    const { settleWithRazorpay } = await import('@/lib/orders/payment-check')
    expect(await settleWithRazorpay(s.A, o.id)).toBe('unpaid')
    expect(Number((await t.order(o.id)).gatewayFee)).toBe(p.fee)
    expect((await t.refunds(o.id)).filter((r) => r.razorpayPaymentId === p.id)).toHaveLength(1)
  }, 120_000)

  it('a difference under ₹1 applies at once; a payment 6 months old cannot be refunded', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { orders } = await import('@/lib/db/schema-orders')
    const { and, eq } = await import('drizzle-orm')
    const o = await t.paidOrder([{ variantId: s.s, qty: 1 }])
    const line = await t.lineOf(o.id, s.s)
    // S → M is fifty paise more: not asked for (Razorpay's minimum is ₹1); the shop absorbs it.
    const r = await t.edit(o.id, [{ line: line.id, variantId: s.m, qty: 1 }])
    if (!r.ok) throw new Error(r.error)
    expect(r).not.toHaveProperty('asked')
    expect((await t.live(o.id)).map((l) => l.variantId)).toEqual([s.m])
    expect(await t.refunds(o.id)).toEqual([])
    expect((await t.edits(o.id))[0]!.asked).toBeNull()

    // Paid seven months ago: a lower total can't be refunded through Razorpay, refused before Save.
    const o2 = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
    await t.withTenant(s.A, (tx) => tx.update(orders).set({ paidAt: new Date(Date.now() - 214 * 86_400_000) }).where(and(eq(orders.tenantId, s.A), eq(orders.id, o2.id))))
    const l2 = await t.lineOf(o2.id, s.coordM)
    expect(await t.edit(o2.id, [{ line: l2.id, variantId: s.coordM, qty: 1 }])).toEqual({ ok: false, error: 'Paid over 6 months ago: Razorpay can\'t refund it. Keep the order as it was.' })
    expect((await t.live(o2.id))[0]!.qty).toBe(2)
  }, 120_000)

  it('Try again never sends a refund a later change settled (security H1), either way; an edit that settled one has no Undo', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { sendRefund, retryRefund } = await import('@/lib/payments/refunds')
    const { dropRequest } = await import('@/lib/orders/edit-paid')
    const retry = (id: string) => t.withTenant(s.A, (tx) => retryRefund(tx, s.A, id, new Date()))
    // ₹4,812 paid; down to ₹2,431: the ₹2,381 refund is refused for low balance.
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
    const l = await t.lineOf(o.id, s.coordM)
    const down = await t.edit(o.id, [{ line: l.id, variantId: s.coordM, qty: 1 }])
    if (!down.ok) throw new Error(down.error)
    const [r1] = await t.refunds(o.id)
    rz.s.next.push('balance')
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${r1!.id}`))!)
    // Up to ₹4,330 with a kurta added: worked out against all ₹4,812 still with the shop, so ₹482 goes back, and the
    // failed ₹2,381 is settled by it — Try again on it is refused (₹4,812 − ₹4,330 < ₹2,381), never sent.
    const up = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.coordM)).id, variantId: s.coordM, qty: 1 }, { line: null, variantId: s.s, qty: 1 }])
    if (!up.ok) throw new Error(up.error)
    expect(up).toMatchObject({ refund: 481200 - (238100 + 189900 + 5000) })
    const second = (await t.edits(o.id))[1]!
    expect((await t.refunds(o.id)).find((r) => r.id === r1!.id)!.supersededBy).toBe(second.id)
    expect(await retry(r1!.id)).toEqual({ ok: false, error: 'A later change of this order settled it. Nothing to send.' })
    expect(await t.undo(up.eventId)).toEqual({ ok: false, error: 'It settled a refund that wasn\'t sent: this change can\'t be undone. Edit the items instead.' })
    expect(refundCalls().filter((c) => c.body.receipt === r1!.id)).toHaveLength(1)

    // The other way: a failed refund, then a change asking for more. While it waits, the payment it asks for was worked
    // out with that refund's money as the shop's: Try again is refused. Dropped, the money is owed again: Try again sends it.
    const o2 = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
    const m2 = await t.lineOf(o2.id, s.coordM)
    const d2 = await t.edit(o2.id, [{ line: m2.id, variantId: s.coordM, qty: 1 }])
    if (!d2.ok) throw new Error(d2.error)
    const [f2] = await t.refunds(o2.id)
    rz.s.next.push('balance')
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${f2!.id}`))!)
    const ask = await t.edit(o2.id, [{ line: (await t.lineOf(o2.id, s.coordM)).id, variantId: s.coordM, qty: 1 }, { line: null, variantId: s.coordL, qty: 1 }])
    if (!ask.ok) throw new Error(ask.error)
    expect(ask).toMatchObject({ asked: 238100 + 288000 + 5000 - 481200 })
    expect(await retry(f2!.id)).toEqual({ ok: false, error: 'A later change of this order settled it. Nothing to send.' })
    expect((await t.withTenant(s.A, (tx) => dropRequest(tx, s.A, ACTOR, o2.id))).ok).toBe(true)
    expect(await retry(f2!.id)).toEqual({ ok: true })
  }, 120_000)

  it('an attempt left unresolved stays on its way until the claim\'s check reads the list: absent → failed, present (or an earlier attempt\'s) → recorded, never twice (security M1, re-review M3, L4)', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { sendRefund, sendRefundCheck, retryRefund } = await import('@/lib/payments/refunds')
    const { MAX_ATTEMPTS } = await import('@/lib/outbox')
    const { outbox } = await import('@/lib/db/schema')
    const { and, eq } = await import('drizzle-orm')
    const lower = async () => {
      const o = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
      const r = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.coordM)).id, variantId: s.coordM, qty: 1 }])
      if (!r.ok) throw new Error(r.error)
      const [x] = await t.refunds(o.id)
      return { o, row: { ...(await t.outboxRow('refund.send', `refund.send:${x!.id}`))!, attempts: MAX_ATTEMPTS }, id: x!.id }
    }
    // The sender's row as the drain leaves it: sent (it returned) or dead (its tries ran out).
    const senderDone = (id: string, how: 'sentAt' | 'deadAt') => t.withTenant(s.A, (tx) => tx.update(outbox).set({ [how]: new Date() }).where(and(eq(outbox.tenantId, s.A), eq(outbox.dedupeKey, `refund.send:${id}`))))
    // The check as the drain runs it an hour after the claim (absent once is not enough: it lists again 30 minutes on).
    const settle = async (id: string, minutes = 61) => { const row = (await t.outboxRow('refund.check', `refund.settle:${id}`))!; return sendRefundCheck({ ...row, createdAt: new Date(Date.now() - minutes * 60_000) }) }

    // No answer on the last try, and Razorpay never got it: not failed then (it may not be listed yet) — on its way, no
    // Try again. The claim's check, once the sender is done, lists it absent: failed, and Try again appears.
    const a = await lower()
    rz.s.next.push('down')
    await sendRefund(a.row)
    expect((await t.refunds(a.o.id))[0]).toMatchObject({ failedAt: null, sentAt: null })
    expect((await t.refunds(a.o.id))[0]!.sendingAt).not.toBeNull()
    // While the sender may still try, the check waits for it.
    await expect(settle(a.id)).rejects.toMatchObject({ name: 'Later' })
    await senderDone(a.id, 'sentAt')
    // Absent at its first read, 30 minutes on: read again later, not failed yet.
    await expect(settle(a.id, 31)).rejects.toMatchObject({ name: 'Later' })
    expect((await t.refunds(a.o.id))[0]!.failedAt).toBeNull()
    await settle(a.id)
    expect((await t.refunds(a.o.id))[0]).toMatchObject({ failure: 'refused', sentAt: null })

    // Razorpay made it, the answer was lost and its list lags: the last try leaves it on its way; the check, once the list
    // has it, records it — never failed.
    const b = await lower()
    rz.s.next.push('lost')
    await sendRefund(b.row)
    await senderDone(b.id, 'sentAt')
    await settle(b.id)
    const got = (await t.refunds(b.o.id))[0]!
    expect([got.failedAt, got.razorpayRefundId?.startsWith('rfnd_')]).toEqual([null, true])

    // An error after the claim on an earlier try, then the outbox row died (L4): the check settles it the same way.
    const c = await lower()
    rz.s.next.push('down')
    await expect(sendRefund({ ...c.row, attempts: 1 })).rejects.toThrow('razorpay unreachable')
    // Its last try: the earlier create went unanswered and may be in flight, so none is made again (impact re-review).
    const creates0 = refundCalls().length
    await sendRefund(c.row)
    expect(refundCalls().length).toBe(creates0)
    expect((await t.refunds(c.o.id))[0]).toMatchObject({ failedAt: null, sentAt: null })
    await senderDone(c.id, 'deadAt')
    await settle(c.id)
    expect((await t.refunds(c.o.id))[0]).toMatchObject({ failure: 'refused' })

    // Made at Razorpay but not listed when the check read it (failed as refused); Try again's new attempt lists first and
    // finds the earlier attempt's receipt in its chain: recorded as that refund, nothing sent twice.
    const d = await lower()
    rz.s.next.push('lost')
    await sendRefund(d.row)
    rz.s.hidden.add(d.id)
    await senderDone(d.id, 'sentAt')
    await settle(d.id)
    expect((await t.refunds(d.o.id))[0]).toMatchObject({ failure: 'refused' })
    expect(await t.withTenant(s.A, (tx) => retryRefund(tx, s.A, d.id, new Date()))).toEqual({ ok: true })
    rz.s.hidden.delete(d.id)
    const d2 = (await t.refunds(d.o.id))[1]!
    const creates = refundCalls().length
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${d2.id}`))!)
    expect(refundCalls().length).toBe(creates)
    expect((await t.refunds(d.o.id))[1]!.razorpayRefundId).toBe(rz.s.refunds.find((x) => x.receipt === d.id)!.id)

    // A week on with the sender still looping: failed as refused, so it shows owed with Try again (security pass 3 L3).
    const eo = await t.paidOrder([{ variantId: s.s, qty: 2 }])
    const er = await t.edit(eo.id, [{ line: (await t.lineOf(eo.id, s.s)).id, variantId: s.s, qty: 1 }])
    if (!er.ok) throw new Error(er.error)
    const [e] = await t.refunds(eo.id)
    rz.s.next.push('down')
    await sendRefund({ ...(await t.outboxRow('refund.send', `refund.send:${e!.id}`))!, attempts: 1 }).catch(() => {})
    await settle(e!.id, 8 * 24 * 60)
    expect((await t.refunds(eo.id))[0]).toMatchObject({ failure: 'refused' })
  }, 120_000)

  it('a refund failing AFTER a later change was planned is still owed (security re-review H1): immediate and waiting', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { sendRefund, retryRefund } = await import('@/lib/payments/refunds')
    const { startEditPayment } = await import('@/lib/orders/edit-paid')
    const retry = (id: string) => t.withTenant(s.A, (tx) => retryRefund(tx, s.A, id, new Date()))
    // Immediate: ₹4,812 → ₹2,431 (₹2,381 queued), then → ₹1,949 while it waits (₹482 more): both counted as going back.
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
    const a = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.coordM)).id, variantId: s.coordM, qty: 1 }])
    if (!a.ok) throw new Error(a.error)
    const [r1] = await t.refunds(o.id)
    const b = await t.edit(o.id, [{ line: null, variantId: s.s, qty: 1 }], { [(await t.lineOf(o.id, s.coordM)).id]: 'customer_asked' })
    if (!b.ok) throw new Error(b.error)
    expect(b).toMatchObject({ refund: 243100 - (189900 + 5000) })
    // Only now does the first fail: it was counted as on its way, so it is not settled, and Try again sends it.
    rz.s.next.push('balance')
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${r1!.id}`))!)
    expect((await t.refunds(o.id)).find((r) => r.id === r1!.id)).toMatchObject({ failure: 'balance', supersededBy: null })
    expect(await retry(r1!.id)).toEqual({ ok: true })

    // Waiting: ₹4,812 → ₹2,431 (₹2,381 queued), then up to ₹5,311 asking ₹2,880 (worked out with the ₹2,381 as going back).
    const w = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
    const wa = await t.edit(w.id, [{ line: (await t.lineOf(w.id, s.coordM)).id, variantId: s.coordM, qty: 1 }])
    if (!wa.ok) throw new Error(wa.error)
    const [f1] = await t.refunds(w.id)
    const ask = await t.edit(w.id, [{ line: (await t.lineOf(w.id, s.coordM)).id, variantId: s.coordM, qty: 1 }, { line: null, variantId: s.coordL, qty: 1 }])
    if (!ask.ok) throw new Error(ask.error)
    expect(ask).toMatchObject({ asked: 238100 + 288000 + 5000 - 243100 })
    // The ₹2,381 fails after the change was saved: still owed — Try again is offered while it waits, and after it is paid.
    rz.s.next.push('balance')
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${f1!.id}`))!)
    const st = await startEditPayment(s.A, w.hash)
    if (!st.ok) throw new Error(st.error)
    await t.capture(st.pay.razorpayOrderId)
    expect(Number((await t.order(w.id)).total)).toBe(531100)
    expect((await t.refunds(w.id)).find((r) => r.id === f1!.id)).toMatchObject({ failure: 'balance', supersededBy: null })
    expect(await retry(f1!.id)).toEqual({ ok: true })
  }, 120_000)

  it('Try again is not offered, and refused, for a payment already refunded elsewhere or too old', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { sendRefund, retryRefund } = await import('@/lib/payments/refunds')
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
    const d = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.coordM)).id, variantId: s.coordM, qty: 1 }])
    if (!d.ok) throw new Error(d.error)
    const [r] = await t.refunds(o.id)
    // The merchant refunded most of it in Razorpay's dashboard meanwhile: more than is left → failed as `over`.
    rz.s.refunds.push({ id: `rfnd_DASH${s.stamp}`, entity: 'refund', amount: 400000, receipt: 'dashboard', status: 'processed', payment_id: r!.razorpayPaymentId, notes: {}, speed_requested: 'normal' })
    await sendRefund((await t.outboxRow('refund.send', `refund.send:${r!.id}`))!)
    expect((await t.refunds(o.id))[0]).toMatchObject({ failure: 'over' })
    expect(await t.withTenant(s.A, (tx) => retryRefund(tx, s.A, r!.id, new Date()))).toEqual({ ok: false, error: 'Razorpay won\'t take this refund. Check Razorpay.' })
    expect(await t.refunds(o.id)).toHaveLength(1)
  }, 120_000)

  it('a payment at the old total refunded in full stays refunded after the edit is undone (security re-review M2)', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { switchToCod, storeRazorpayEvent, processEvents } = await import('@/lib/orders/payment')
    const { quoteData } = await import('@/lib/queries/checkout')
    const { quote } = await import('@/domains/checkout/quote')
    const o = await t.paidOrder([{ variantId: s.s, qty: 2 }], { pay: false })
    const d = await quoteData(s.A, [s.s], new Date(), null, HOST)
    const q = quote([{ variantId: s.s, qty: 2 }], d.rows, d.shop!, new Date(), '302021', { offers: d.offers })
    expect(await switchToCod(s.A, o.hash, q.cod.total)).toEqual({ kind: 'switched', total: q.cod.total })
    const e = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.s)).id, variantId: s.s, qty: 1 }])
    if (!e.ok) throw new Error(e.error)
    const p = await t.capture(o.rzp)
    expect((await t.order(o.id)).paidAt).toBeNull()
    expect((await t.undo(e.eventId)).ok).toBe(true)
    // A late order.paid / a re-sent capture for the same payment: still refunded, never the order's payment.
    await storeRazorpayEvent(s.A, `razorpay:order.paid:${p.id}`, { event: 'order.paid', payload: { payment: { entity: p } } })
    await processEvents(s.A)
    expect((await t.order(o.id)).paidAt).toBeNull()
    expect((await t.refunds(o.id)).filter((r) => r.razorpayPaymentId === p.id)).toHaveLength(1)
  }, 120_000)

  it('cancelling a paid order after an edit names what the payments still hold (after a lower edit, after a paid increase)', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { cancel } = await import('@/lib/orders/work')
    const { startEditPayment } = await import('@/lib/orders/edit-paid')
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 2 }])
    const d = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.coordM)).id, variantId: s.coordM, qty: 1 }])
    if (!d.ok) throw new Error(d.error)
    // The ₹2,381 refund is queued (Undo window): the cancel refunds the rest, ₹2,431, not the ₹4,812 placed.
    expect(await t.withTenant(s.A, (tx) => cancel(tx, s.A, ACTOR, o.id, { reason: 'customer_cancelled', restock: true }))).toMatchObject({ ok: true, refund: 243100 })
    // Paid ₹2,431, then ₹499 more for a change: the cancel refunds both, ₹2,930.
    const o2 = await t.paidOrder([{ variantId: s.coordM, qty: 1 }])
    const up = await t.edit(o2.id, [{ line: (await t.lineOf(o2.id, s.coordM)).id, variantId: s.coordL, qty: 1 }])
    if (!up.ok) throw new Error(up.error)
    const st = await startEditPayment(s.A, o2.hash)
    if (!st.ok) throw new Error(st.error)
    await t.capture(st.pay.razorpayOrderId)
    expect(Number((await t.order(o2.id)).total)).toBe(293000)
    expect(await t.withTenant(s.A, (tx) => cancel(tx, s.A, ACTOR, o2.id, { reason: 'customer_cancelled', restock: true }))).toMatchObject({ ok: true, refund: 293000 })
  }, 120_000)

  it('cancelled while a change waits: its held pieces go back (sold-out refresh); a payment after it is refunded and its fee kept', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { cancel } = await import('@/lib/orders/work')
    const { startEditPayment } = await import('@/lib/orders/edit-paid')
    const { heldByVariant } = await import('@/lib/db/order-predicates')
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 1 }])
    const held0 = (await t.free(s.coordL)).held
    const up = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.coordM)).id, variantId: s.coordL, qty: 1 }])
    if (!up.ok) throw new Error(up.error)
    // The shop's cached pages and checkout read the same held count (heldByVariant and heldSql agree).
    expect((await t.free(s.coordL)).held).toBe(held0 + 1)
    expect((await t.withTenant(s.A, (tx) => heldByVariant(tx, s.A, new Date()))).get(s.coordL)).toBe(held0 + 1)
    const st = await startEditPayment(s.A, o.hash)
    if (!st.ok) throw new Error(st.error)
    const done = await t.withTenant(s.A, (tx) => cancel(tx, s.A, ACTOR, o.id, { reason: 'customer_cancelled', restock: false }))
    expect(done).toMatchObject({ ok: true, backInStock: [s.coordL] })
    expect(await t.heldOn((await t.edits(o.id))[0]!.id)).toBe(0)
    expect((await t.free(s.coordL)).held).toBe(held0)
    expect((await t.withTenant(s.A, (tx) => heldByVariant(tx, s.A, new Date()))).get(s.coordL) ?? 0).toBe(held0)
    const fee0 = Number((await t.order(o.id)).gatewayFee)
    const late = await t.capture(st.pay.razorpayOrderId)
    expect((await t.refunds(o.id)).map((r) => [r.cause, Number(r.amount), Number(r.gatewayFee)])).toEqual([['after_drop', 49900, late.fee]])
    // Profit per order carries Razorpay's fee on the payment it refunded in full.
    expect(Number((await t.order(o.id)).gatewayFee)).toBe(fee0 + late.fee)
  }, 120_000)

  it('at capture, a saving that grew past its offer\'s budget since Save refuses the change: dropped, refunded, its pieces back', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { discounts } = await import('@/lib/db/schema-discounts')
    const { startEditPayment } = await import('@/lib/orders/edit-paid')
    const { and, eq } = await import('drizzle-orm')
    const [d] = await t.withTenant(s.A, (tx) => tx.insert(discounts).values({ tenantId: s.A, title: 'Festive 10%', style: 'order_off', percentBps: 1000, budget: 1_000_000,
      startsAt: new Date(Date.now() - 60_000), startedAt: new Date(), startedBy: ME, createdBy: ME }).returning({ id: discounts.id }))
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 1 }])
    const up = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.coordM)).id, variantId: s.coordL, qty: 1 }])
    if (!up.ok) throw new Error(up.error)
    const held0 = (await t.free(s.coordL)).held
    // Meanwhile the shop cut the offer's budget below the bigger saving.
    await t.withTenant(s.A, (tx) => tx.update(discounts).set({ budget: 20_000 }).where(and(eq(discounts.tenantId, s.A), eq(discounts.id, d!.id))))
    const st = await startEditPayment(s.A, o.hash)
    if (!st.ok) throw new Error(st.error)
    const p = await t.capture(st.pay.razorpayOrderId)
    expect((await t.live(o.id)).map((l) => l.variantId)).toEqual([s.coordM])
    expect((await t.edits(o.id))[0]).toMatchObject({ droppedReason: 'cannot_apply', paidAt: null })
    expect((await t.refunds(o.id)).map((r) => [r.cause, r.razorpayPaymentId])).toEqual([['after_drop', p.id]])
    expect((await t.free(s.coordL)).held).toBe(held0 - 1)
    expect(await t.heldOn((await t.edits(o.id))[0]!.id)).toBe(0)
  }, 120_000)

  it('a change paid before the order\'s own fee was known: the fee, when it comes, adds both (markPaid and editFeesSql); Razorpay asked for a lost payment', async () => {
    const s = await shop()
    const t = await tools(s.A, s.stamp)
    const { startEditPayment } = await import('@/lib/orders/edit-paid')
    const { sendEditPaymentCheck } = await import('@/lib/orders/payment-check')
    const { storeRazorpayEvent, processEvents } = await import('@/lib/orders/payment')
    // Paid by the browser's reply only (no fee yet).
    const o = await t.paidOrder([{ variantId: s.coordM, qty: 1 }], { fee: false })
    expect((await t.order(o.id)).gatewayFee).toBeNull()
    const up = await t.edit(o.id, [{ line: (await t.lineOf(o.id, s.coordM)).id, variantId: s.coordL, qty: 1 }])
    if (!up.ok) throw new Error(up.error)
    const st = await startEditPayment(s.A, o.hash)
    if (!st.ok) throw new Error(st.error)
    // The change's payment: its reply and webhook both lost; the edit.payment check finds it at Razorpay and applies it.
    const paid = rz.pay(st.pay.razorpayOrderId, SECRET).payment
    const [e] = await t.edits(o.id)
    await sendEditPaymentCheck((await t.outboxRow('edit.payment', `edit.payment:${e!.id}`))!)
    expect((await t.edits(o.id))[0]).toMatchObject({ razorpayPaymentId: paid.id, gatewayFee: paid.fee })
    expect(Number((await t.order(o.id)).total)).toBe(293000)
    expect((await t.order(o.id)).gatewayFee).toBeNull()
    // The order's own payment's webhook, with its fee: both fees on the order.
    const own = [...rz.s.payments.values()].find((x) => x.order_id === o.rzp)!
    await storeRazorpayEvent(s.A, `razorpay:payment.captured:${own.id}`, { event: 'payment.captured', payload: { payment: { entity: own } } })
    await processEvents(s.A)
    expect(Number((await t.order(o.id)).gatewayFee)).toBe(own.fee + paid.fee)
  }, 120_000)
})
