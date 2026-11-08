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
    const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
    const slug = `bill-${Date.now()}`
    tenantId = (await admin.createMerchant(staff, { name: 'Bill Store', slug, host: `${slug}.frata.test`, ownerEmail: 'o@bill.test', planCode: 'launch', trialEndsAt: null, now: ist('2026-10-01T00:00:00') })).id
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
})
