// Issuing a credit note (Documents D3) on a REAL Postgres with the real roles (migrated by scripts/verify/tenancy.sh).
// Skipped unless INT_DB_HOST is set (CI sets it). A packed order cancelled afterwards gets one credit note, numbered
// in the credit series, with the invoice's own figures; a second is refused; the note is final; an order cancelled
// before packing gets none. A return after delivery puts its pieces back in stock only when asked, once, never more
// than the line sold; goodwill and a discount never do; restocked pieces' cost comes off the order's COGS (cogsSql).
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('issueCredit on a real database', () => {
  let tenantId = ''
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    const admin = await import('@/lib/admin/merchants')
    const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
    const slug = `credit-${Date.now()}`
    tenantId = (await admin.createMerchant(staff, { name: 'Credit Store', slug, ownerEmail: 'o@credit.test', planCode: 'launch', trialEndsAt: null, now: new Date() })).id
  })

  it('one credit note per undone sale, in its own series, with the invoice figures; final; none without an invoice', async () => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines, creditNotes } = await import('@/lib/db/schema-orders')
    const { issueCredit } = await import('../credit')
    const { eq } = await import('drizzle-orm')
    const actor = { kind: 'member' as const, userId: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'owner@credit.test' }
    const now = new Date('2026-11-08T08:00:00Z')
    const ids = await withTenant(tenantId, async (tx) => {
      const base = { tenantId, paymentMethod: 'cod' as const, placedAt: new Date('2026-11-07T05:00:00Z'), confirmedAt: new Date('2026-11-07T06:00:00Z'), customerName: 'Riya', city: 'Jaipur', pincode: '302001', state: 'Rajasthan', supplyState: 'Rajasthan',
        sellerGstin: '08AAAAA0000A1Z5', subtotal: 249000, gstTotal: 11857, total: 249000, cancelledAt: new Date('2026-11-08T05:00:00Z'), cancelReason: 'customer_cancelled' }
      const [a] = await tx.insert(orders).values({ ...base, number: 1, packedAt: new Date('2026-11-07T09:00:00Z'), invoiceNumber: 'CS/26-27/00001' }).returning({ id: orders.id })
      const [b] = await tx.insert(orders).values({ ...base, number: 2 }).returning({ id: orders.id })
      for (const o of [a!, b!]) await tx.insert(orderLines).values({ tenantId, orderId: o.id, title: 'Kurta', qty: 1, unitPrice: 249000, taxableValue: 237143, gst: 11857, gstBps: 500, kind: 'in_stock', chargeTaxable: 0, chargeGst: 0 })
      return { a: a!.id, b: b!.id }
    })
    const r = await withTenant(tenantId, (tx) => issueCredit(tx, tenantId, actor, ids.a, now))
    expect(r).toMatchObject({ ok: true, number: expect.stringMatching(/\/26-27\/C0001$/) })
    const again = await withTenant(tenantId, (tx) => issueCredit(tx, tenantId, actor, ids.a, now))
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/^(Already credited|Everything on this invoice is credited already)/) })
    expect(await withTenant(tenantId, (tx) => issueCredit(tx, tenantId, actor, ids.b, now))).toMatchObject({ ok: false, error: expect.stringMatching(/No invoice was issued/) })
    const [cn] = await withTenant(tenantId, (tx) => tx.select().from(creditNotes).where(eq(creditNotes.orderId, ids.a)))
    expect([cn!.againstInvoice, cn!.reason, cn!.taxable, cn!.cgst + cn!.sgst, cn!.total]).toEqual(['CS/26-27/00001', 'cancelled', 237143, 11857, 249000])
    // Came back: the second credit note, C0002, says why; and undoing Came back is refused once credited (a later
    // credit_noted event — the order can never be billed or delivered again behind its credit note).
    const out = await import('../outcomes')
    const owner = { ...actor, role: 'owner' as const }
    const c = await withTenant(tenantId, async (tx) => {
      const [o] = await tx.insert(orders).values({ tenantId, number: 3, paymentMethod: 'cod', placedAt: new Date('2026-11-07T05:00:00Z'), confirmedAt: new Date('2026-11-07T06:00:00Z'),
        packedAt: new Date('2026-11-07T09:00:00Z'), invoiceNumber: 'CS/26-27/00002', sellerGstin: '08AAAAA0000A1Z5', customerName: 'Kabir', city: 'Jaipur', pincode: '302001', state: 'Rajasthan', supplyState: 'Rajasthan',
        subtotal: 249000, gstTotal: 11857, total: 249000 }).returning({ id: orders.id })
      await tx.insert(orderLines).values({ tenantId, orderId: o!.id, title: 'Kurta', qty: 1, unitPrice: 249000, taxableValue: 237143, gst: 11857, gstBps: 500, kind: 'in_stock', chargeTaxable: 0, chargeGst: 0 })
      return o!.id
    })
    await withTenant(tenantId, (tx) => out.markShipped(tx, { tenantId, actor, orderId: c, now: new Date('2026-11-08T06:00:00Z') }))
    const back = await withTenant(tenantId, (tx) => out.markCameBack(tx, { tenantId, actor, orderId: c, restock: false, now: new Date('2026-11-08T06:30:00Z') }))
    expect(back.ok).toBe(true)
    const r2 = await withTenant(tenantId, (tx) => issueCredit(tx, tenantId, actor, c, new Date('2026-11-08T07:00:00Z')))
    expect(r2).toMatchObject({ ok: true, number: expect.stringMatching(/\/26-27\/C0002$/) })
    const [cn2] = await withTenant(tenantId, (tx) => tx.select({ reason: creditNotes.reason }).from(creditNotes).where(eq(creditNotes.orderId, c)))
    expect(cn2!.reason).toBe('came_back')
    const undo = await withTenant(tenantId, (tx) => out.undoOutcome(tx, tenantId, owner, (back as { eventId: string }).eventId, new Date('2026-11-08T07:30:00Z')))
    expect(undo).toMatchObject({ ok: false, error: 'This order changed since: open it to see what happened.' })
    // A Frrata support visit cannot issue one (security review 2026-11-08).
    expect(await withTenant(tenantId, (tx) => issueCredit(tx, tenantId, { ...actor, kind: 'support' }, ids.a, now))).toMatchObject({ ok: false, error: expect.stringMatching(/owner or an admin/) })
    await expect(withTenant(tenantId, (tx) => tx.update(creditNotes).set({ total: 0 }).where(eq(creditNotes.orderId, ids.a)))).rejects.toThrow()
  })

  it('a return puts its pieces back in stock when ticked, once, never past what was sold; goodwill and discounts never; their cost comes off COGS', async () => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines, creditNotes, creditNoteLines } = await import('@/lib/db/schema-orders')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { cogsSql } = await import('@/lib/db/order-predicates')
    const { issueCredit } = await import('../credit')
    const { eq, sql } = await import('drizzle-orm')
    const actor = { kind: 'member' as const, userId: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'owner@credit.test' }
    const now = new Date('2026-11-10T08:00:00Z')
    // Three kurtas at ₹1,000 incl. 5% (₹900 cost each), delivered; the variant has sold out since.
    const { orderId, lineId, variantId } = await withTenant(tenantId, async (tx) => {
      const [p] = await tx.insert(products).values({ tenantId, handle: `int-restock-${Date.now()}`, title: 'Int kurta', options: ['Size'], status: 'active' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId, productId: p!.id, optionValues: ['M'], price: 100000, unitCost: 90000, stock: 0 }).returning({ id: variants.id })
      const at = (h: number) => new Date(Date.parse('2026-11-07T05:00:00Z') + h * 3_600_000)
      const [o] = await tx.insert(orders).values({ tenantId, number: 10, paymentMethod: 'cod', placedAt: at(0), confirmedAt: at(1), packedAt: at(2), shippedAt: at(3), deliveredAt: at(30),
        invoiceNumber: 'CS/26-27/00010', sellerGstin: '08AAAAA0000A1Z5', customerName: 'Meera', city: 'Jaipur', pincode: '302001', state: 'Rajasthan', supplyState: 'Rajasthan',
        subtotal: 300000, gstTotal: 14286, total: 300000, cogs: 270000 }).returning({ id: orders.id })
      const [l] = await tx.insert(orderLines).values({ tenantId, orderId: o!.id, variantId: v!.id, title: 'Kurta', qty: 3, unitPrice: 100000, taxableValue: 285714, gst: 14286, gstBps: 500,
        kind: 'in_stock', unitCost: 90000, stockTakenAt: at(0), chargeTaxable: 0, chargeGst: 0 }).returning({ id: orderLines.id })
      return { orderId: o!.id, lineId: l!.id, variantId: v!.id }
    })
    const credit = (req: Parameters<typeof issueCredit>[5]) => withTenant(tenantId, (tx) => issueCredit(tx, tenantId, actor, orderId, now, req))
    const stock = async () => (await withTenant(tenantId, (tx) => tx.select({ s: variants.stock }).from(variants).where(eq(variants.id, variantId))))[0]!.s
    const restocked = async () => (await withTenant(tenantId, (tx) => tx.select({ q: creditNoteLines.restockedQty }).from(creditNoteLines).where(eq(creditNoteLines.orderLineId, lineId)))).reduce((a, r) => a + r.q, 0)
    const cogs = async () => Number((await withTenant(tenantId, (tx) => tx.execute(sql`select ${cogsSql('o')} v from orders o where o.tenant_id = ${tenantId} and o.id = ${orderId}`)))[0]!.v)

    // Goodwill and a discount agreed before the sale: money only, never stock.
    expect(await credit({ kind: 'discount', amount: 10000, agreed: false })).toMatchObject({ ok: true, backInStock: [] })
    expect(await credit({ kind: 'discount', amount: 1000, agreed: true })).toMatchObject({ ok: true, backInStock: [] })
    expect([await stock(), await restocked(), await cogs()]).toEqual([0, 0, 270000])
    // Unticked: credited, nothing back in stock, the cost stays.
    expect(await credit({ kind: 'return', lines: { [lineId]: 1 }, restock: false })).toMatchObject({ ok: true, backInStock: [] })
    expect([await stock(), await restocked(), await cogs()]).toEqual([0, 0, 270000])
    // Ticked: the piece goes back once, from 0 (the shop refreshes), and its cost comes off COGS.
    expect(await credit({ kind: 'return', lines: { [lineId]: 1 }, restock: true })).toMatchObject({ ok: true, backInStock: [variantId] })
    expect([await stock(), await restocked(), await cogs()]).toEqual([1, 1, 180000])
    // The last piece of the line, ticked: back too; then nothing is left to credit or restock, and stock never passes what was sold.
    expect(await credit({ kind: 'return', lines: { [lineId]: 1 }, restock: true })).toMatchObject({ ok: true, backInStock: [] })
    expect(await credit({ kind: 'return', lines: { [lineId]: 1 }, restock: true })).toMatchObject({ ok: false, error: 'At most 0 can be credited for that item.' })
    expect([await stock(), await restocked(), await cogs()]).toEqual([2, 2, 90000])
    // Once per note: what a note put back is final with its lines.
    await expect(withTenant(tenantId, (tx) => tx.update(creditNoteLines).set({ restockedQty: 0 }).where(eq(creditNoteLines.orderLineId, lineId)))).rejects.toThrow()
    const notes = await withTenant(tenantId, (tx) => tx.select({ kind: creditNotes.kind }).from(creditNotes).where(eq(creditNotes.orderId, orderId)))
    expect(notes.map((n) => n.kind).sort()).toEqual(['discount', 'goodwill', 'return', 'return', 'return'])
  })
})
