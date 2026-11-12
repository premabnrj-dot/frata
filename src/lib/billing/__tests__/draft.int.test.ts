// The billing run's draft on a REAL Postgres with the real roles (migrated by scripts/verify/tenancy.sh). Skipped
// unless INT_DB_HOST is set (CI sets it). A shop on Launch since October; December's invoice bills November's
// delivered orders once, however many times it is drafted, and a redraft drops an order that came back.
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const ist = (s: string) => new Date(`${s}+05:30`)

describe.skipIf(!host)('draftInvoice on a real database', () => {
  let tenantId = ''
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    const admin = await import('@/lib/admin/merchants')
    const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const, sessionId: '00000000-0000-4000-8000-000000000000', confirmedAt: new Date() }
    const slug = `bill-${Date.now()}`
    tenantId = (await admin.createMerchant(staff, { name: 'Bill Store', slug, ownerEmail: 'o@bill.test', planCode: 'launch', trialEndsAt: null, now: ist('2026-10-01T00:00:00') })).id
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    await withTenant(tenantId, async (tx) => {
      const base = { tenantId, paymentMethod: 'cod' as const, placedAt: ist('2026-10-15T10:00:00'), confirmedAt: ist('2026-10-15T11:00:00'), packedAt: ist('2026-10-16T10:00:00'), merchandiseNet: 85714 }
      await tx.insert(orders).values([
        { ...base, number: 1, invoiceNumber: 'BS/26-27/1', shippedAt: ist('2026-11-05T10:00:00'), deliveredAt: ist('2026-11-10T10:00:00') }, // delivered in Nov
        { ...base, number: 2, invoiceNumber: 'BS/26-27/2', shippedAt: ist('2026-10-20T10:00:00') }, // assumed delivered 19 Nov
        { ...base, number: 3, invoiceNumber: 'BS/26-27/3', shippedAt: ist('2026-11-25T10:00:00') }, // billable 25 Dec: not yet
        { ...base, number: 4, invoiceNumber: 'BS/26-27/4' }, // packed, never shipped: never billed
      ])
    })
  })

  it('bills each billable order once, however often it is drafted; a redraft drops one that came back', async () => {
    const { draftInvoice } = await import('../draft')
    const { withTenant } = await import('@/lib/db/tenant')
    const { frrataInvoiceFees, frrataInvoiceLines, frrataInvoices } = await import('@/lib/db/schema-billing')
    const { orders } = await import('@/lib/db/schema-orders')
    const { eq, and } = await import('drizzle-orm')
    const dec = ist('2026-12-01T00:00:00'), after = ist('2026-12-02T09:00:00')
    const read = () => withTenant(tenantId, async (tx) => ({
      inv: await tx.select().from(frrataInvoices).where(eq(frrataInvoices.tenantId, tenantId)),
      lines: await tx.select({ kind: frrataInvoiceLines.kind, taxable: frrataInvoiceLines.taxable, quantity: frrataInvoiceLines.quantity }).from(frrataInvoiceLines).where(eq(frrataInvoiceLines.tenantId, tenantId)).orderBy(frrataInvoiceLines.position),
      fees: await tx.select({ fee: frrataInvoiceFees.fee }).from(frrataInvoiceFees).where(eq(frrataInvoiceFees.tenantId, tenantId)),
    }))
    // Drafted on 15 November (the month so far): only order 1 is billable by then; order 2 becomes so on the 19th.
    const early = await draftInvoice(tenantId, dec, ist('2026-11-15T09:00:00'))
    expect(early.invoiceId).toBeTruthy()
    expect((await read()).fees).toHaveLength(1)
    const first = await draftInvoice(tenantId, dec, after)
    expect(first.invoiceId).toBeTruthy()
    const a = await read()
    await draftInvoice(tenantId, dec, after)
    const b = await read()
    expect(b.inv).toHaveLength(1)
    expect(b.lines).toEqual(a.lines)
    expect(b.fees).toHaveLength(2)
    // Launch ₹1,499 + 2% of ₹857.14 twice (₹17.14 each, rounded per order), IGST in test mode (no Frrata GSTIN).
    expect(b.lines).toEqual([{ kind: 'plan', taxable: 149900, quantity: 1 }, { kind: 'fee', taxable: 3428, quantity: 2 }])
    expect([b.inv[0]!.taxable, b.inv[0]!.igst, b.inv[0]!.total, b.inv[0]!.ordersBilled]).toEqual([153328, 27599, 180927, 2])
    // Order 1 comes back before the invoice is issued: the redraft simply leaves it out.
    await withTenant(tenantId, (tx) => tx.update(orders).set({ rtoInitiatedAt: ist('2026-11-28T10:00:00') }).where(and(eq(orders.tenantId, tenantId), eq(orders.number, 1))))
    await draftInvoice(tenantId, dec, after)
    const c = await read()
    expect(c.fees).toHaveLength(1)
    expect(c.inv[0]!.taxable).toBe(151614)
    // January's draft bills order 3 (billable 25 December) and nothing already on December's.
    await draftInvoice(tenantId, ist('2027-01-01T00:00:00'), ist('2027-01-02T09:00:00'))
    const d = await read()
    expect(d.inv).toHaveLength(2)
    expect(d.fees).toHaveLength(2)
    expect(d.lines.filter((l) => l.kind === 'fee')).toEqual([{ kind: 'fee', taxable: 1714, quantity: 1 }, { kind: 'fee', taxable: 1714, quantity: 1 }])
  })

  it('a returned item is not billable (owner, 2026-11-12): the fee is on what was kept', async () => {
    const { draftInvoice } = await import('../draft')
    const { withTenant } = await import('@/lib/db/tenant')
    const { frrataInvoiceFees } = await import('@/lib/db/schema-billing')
    const { orders, creditNotes } = await import('@/lib/db/schema-orders')
    const { eq } = await import('drizzle-orm')
    // Order 5, delivered in November; half its value (₹428.57 of ₹857.14) came back on a return credit note before the draft.
    const id = await withTenant(tenantId, async (tx) => {
      const [o] = await tx.insert(orders).values({ tenantId, number: 5, paymentMethod: 'cod', placedAt: ist('2026-10-15T10:00:00'), confirmedAt: ist('2026-10-15T11:00:00'), packedAt: ist('2026-10-16T10:00:00'),
        merchandiseNet: 85714, invoiceNumber: 'BS/26-27/5', shippedAt: ist('2026-11-05T10:00:00'), deliveredAt: ist('2026-11-10T10:00:00') }).returning({ id: orders.id })
      await tx.insert(creditNotes).values({ tenantId, orderId: o!.id, number: 'BS/CN/26-27/9', againstInvoice: 'BS/26-27/5', reason: 'returned', kind: 'return',
        taxable: 42857, cgst: 0, sgst: 0, igst: 0, total: 42857, issuedAt: ist('2026-11-20T10:00:00'), issuedBy: 'aaaaaaaa-0000-0000-0000-0000000000ff' })
      return o!.id
    })
    // A second "return" note long after the return window (none set: 0 + 15 days from delivery) doesn't move the fee.
    await withTenant(tenantId, (tx) => tx.insert(creditNotes).values({ tenantId, orderId: id, number: 'BS/CN/26-27/10', againstInvoice: 'BS/26-27/5', reason: 'returned', kind: 'return',
      taxable: 20000, cgst: 0, sgst: 0, igst: 0, total: 20000, issuedAt: ist('2026-11-29T10:00:00'), issuedBy: 'aaaaaaaa-0000-0000-0000-0000000000ff' }))
    await draftInvoice(tenantId, ist('2026-12-01T00:00:00'), ist('2026-12-02T09:00:00'))
    const [fee] = await withTenant(tenantId, (tx) => tx.select({ base: frrataInvoiceFees.base, fee: frrataInvoiceFees.fee }).from(frrataInvoiceFees).where(eq(frrataInvoiceFees.orderId, id)))
    // 2% of ₹428.57 kept = ₹8.57, never 2% of the ₹857.14 placed (and the late note left out).
    expect(fee).toEqual({ base: 42857, fee: 857 })
  })

  it('an order edit lowers the fee base by itself, and a later return comes off it once (an edit issues no credit note)', async () => {
    const { draftInvoice } = await import('../draft')
    const { withTenant } = await import('@/lib/db/tenant')
    const { frrataInvoiceFees } = await import('@/lib/db/schema-billing')
    const { orders, orderLines, creditNotes } = await import('@/lib/db/schema-orders')
    const { editItems } = await import('@/lib/orders/edit')
    const { eq, and } = await import('drizzle-orm')
    const actor = { kind: 'member' as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test' }
    // Order 6, to confirm, pay on delivery: two ₹500 pieces (not registered for GST: the taxable value is the price).
    const { id, second } = await withTenant(tenantId, async (tx) => {
      const [o] = await tx.insert(orders).values({ tenantId, number: 6, paymentMethod: 'cod', placedAt: ist('2026-10-15T10:00:00'), subtotal: 100000, total: 100000, merchandiseNet: 100000 }).returning({ id: orders.id })
      const ls = await tx.insert(orderLines).values([0, 1].map((position) => ({ tenantId, orderId: o!.id, title: `Piece ${position}`, qty: 1, unitPrice: 50000, taxableValue: 50000, position, chargeTaxable: 0, chargeGst: 0 })))
        .returning({ id: orderLines.id })
      return { id: o!.id, second: ls[1]!.id }
    })
    const lines = await withTenant(tenantId, (tx) => tx.select({ id: orderLines.id }).from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, id))).orderBy(orderLines.position))
    const r = await withTenant(tenantId, (tx) => editItems(tx, tenantId, actor, id, { want: [{ line: lines[0]!.id, variantId: null, qty: 1 }], reasons: { [second]: 'customer_asked' }, notify: false, expectedTotal: 50000 }, ist('2026-10-15T12:00:00')))
    expect(r.ok).toBe(true)
    await withTenant(tenantId, async (tx) => {
      await tx.update(orders).set({ confirmedAt: ist('2026-10-15T13:00:00'), packedAt: ist('2026-10-16T10:00:00'), invoiceNumber: 'BS/26-27/6', shippedAt: ist('2026-11-05T10:00:00'), deliveredAt: ist('2026-11-10T10:00:00') })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
      await tx.insert(creditNotes).values({ tenantId, orderId: id, number: 'BS/CN/26-27/11', againstInvoice: 'BS/26-27/6', reason: 'returned', kind: 'return',
        taxable: 20000, cgst: 0, sgst: 0, igst: 0, total: 20000, issuedAt: ist('2026-11-20T10:00:00'), issuedBy: actor.userId })
    })
    expect(await withTenant(tenantId, async (tx) => (await tx.select({ n: creditNotes.id }).from(creditNotes).where(and(eq(creditNotes.tenantId, tenantId), eq(creditNotes.orderId, id)))).length)).toBe(1)
    await draftInvoice(tenantId, ist('2026-12-01T00:00:00'), ist('2026-12-02T09:00:00'))
    const [fee] = await withTenant(tenantId, (tx) => tx.select({ base: frrataInvoiceFees.base, fee: frrataInvoiceFees.fee }).from(frrataInvoiceFees).where(eq(frrataInvoiceFees.orderId, id)))
    // ₹500 after the edit, less the ₹200 returned = ₹300: 2% = ₹6. The edit's ₹500 never comes off a second time.
    expect(fee).toEqual({ base: 30000, fee: 600 })
  })
})
