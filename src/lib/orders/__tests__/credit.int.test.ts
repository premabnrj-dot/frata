// Issuing a credit note (Documents D3) on a REAL Postgres with the real roles (migrated by scripts/verify/tenancy.sh).
// Skipped unless INT_DB_HOST is set (CI sets it). A packed order cancelled afterwards gets one credit note, numbered
// in the credit series, with the invoice's own figures; a second is refused; the note is final; an order cancelled
// before packing gets none.
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
    tenantId = (await admin.createMerchant(staff, { name: 'Credit Store', slug, host: `${slug}.frata.test`, ownerEmail: 'o@credit.test', planCode: 'launch', trialEndsAt: null, now: new Date() })).id
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
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/^Already credited/) })
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
})
