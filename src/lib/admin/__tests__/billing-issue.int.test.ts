// Billing B2 on a REAL Postgres with the real roles (migrated by scripts/verify/tenancy.sh). Skipped unless INT_DB_HOST is
// set. Issue refuses figures Admin did not review, then numbers and freezes the month in the TEST series (no Frrata
// GSTIN here); a payment and a credit note never exceed what is due; a UTR is used once; the GST export lists both; the
// shop reads its own document; an issued invoice cannot change.
import { beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const ist = (s: string) => new Date(`${s}+05:30`)
const NOV = ist('2026-11-01T00:00:00')

describe.skipIf(!host)('issuing Frrata invoices on a real database', () => {
  let tenantId = ''
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    const admin = await import('@/lib/admin/merchants')
    const slug = `b2-${Date.now()}`
    tenantId = (await admin.createMerchant(staff, { name: 'B2 Store', slug, host: `${slug}.frata.test`, ownerEmail: 'o@b2.test', planCode: 'launch', trialEndsAt: null, now: ist('2026-10-01T00:00:00') })).id
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    await withTenant(tenantId, (tx) => tx.insert(orders).values([1, 2].map((n) => ({ tenantId, number: n, paymentMethod: 'cod' as const, placedAt: ist('2026-10-01T10:00:00'),
      confirmedAt: ist('2026-10-01T11:00:00'), packedAt: ist('2026-10-02T10:00:00'), invoiceNumber: `B2/26-27/${n}`, shippedAt: ist('2026-10-03T10:00:00'), deliveredAt: ist('2026-10-05T10:00:00'), merchandiseNet: 85714 }))))
    const { draftInvoice } = await import('@/lib/billing/draft')
    await draftInvoice(tenantId, NOV)
  })

  it('test mode: refused without the test-database switch; then issues only what was reviewed, in the TEST series; never collected by hand, never filed', async () => {
    const b = await import('../billing')
    const rows = await b.billingMonth(staff, NOV)
    const mine = rows.find((r) => r.tenantId === tenantId)!
    expect(mine.total).toBe(180927) // ₹1,499 + 2 × ₹17.14, IGST 18% (no Frrata GSTIN: test mode)
    const ready = b.toIssue(rows, NOV)
    // Production has no GSTIN yet: issuing there would freeze real drafts as tests. Refused unless this is a test database.
    await expect(b.issueMonth(staff, NOV, { count: ready.count, total: ready.total })).rejects.toThrow(/test-mode issuing is off/)
    process.env.BILLING_TEST_ISSUE = '1'
    vi.resetModules()
    const b2 = await import('../billing')
    await expect(b2.issueMonth(staff, NOV, { count: ready.count, total: ready.total + 1 })).rejects.toThrow()
    const r = await b2.issueMonth(staff, NOV, { count: ready.count, total: ready.total })
    expect(r).toMatchObject({ issued: ready.count, test: true })
    const d = (await b2.invoiceDetail(staff, mine.id))!
    expect(d.invoice.number).toMatch(/^FRR\/T\d\d-\d\d\/\d{6}$/)
    expect([d.invoice.state, d.invoice.due, d.invoice.testMode]).toEqual(['due', 180927, true])
    // A test invoice is never collected by hand.
    await expect(b2.recordPayment(staff, mine.id, { amount: 100000, method: 'bank_transfer', utr: 'UTR000001' })).rejects.toThrow()
    // A credit note: in the TEST series (it follows the invoice), heads at the invoice's own, capped.
    await expect(b2.issueCreditNote(staff, mine.id, { taxable: 153329, reason: 'Too much' })).rejects.toThrow()
    const cn = await b2.issueCreditNote(staff, mine.id, { taxable: 10000, reason: 'Goodwill for a slow week' })
    expect(cn).toMatch(/^FRR\/T\d\d-\d\d\/C\d{5}$/)
    const after = (await b2.invoiceDetail(staff, mine.id))!
    expect([after.invoice.credited, after.invoice.due]).toEqual([11800, 169127])
    // Never in the CA's export.
    const gst = await b2.gstRows(staff, ist('2026-11-01T00:00:00'), ist('2027-12-01T00:00:00'))
    expect(gst.filter((g) => g.number === d.invoice.number || g.number === cn)).toEqual([])
  })

  it('the shop reads its own invoice; staff cannot; an issued invoice never changes', async () => {
    const q = await import('@/lib/queries/billing')
    const b = await import('../billing')
    const mine = (await b.billingMonth(staff, NOV)).find((r) => r.tenantId === tenantId)!
    const doc = await q.shopFrrataDocument({ tenantId, role: 'owner' }, mine.id)
    expect(doc?.totals.total).toBe(180927)
    await expect(q.shopFrrataDocument({ tenantId, role: 'staff' }, mine.id)).rejects.toBeInstanceOf(q.NotForThisRole)
    const o = await q.billingOverview({ tenantId, role: 'owner' }, ist('2026-11-20T12:00:00'))
    expect(o.invoices.find((i) => i.id === mine.id)).toMatchObject({ testMode: true, state: 'due', credits: [{ total: 11800 }] })
    const { withTenant } = await import('@/lib/db/tenant')
    const { frrataInvoices } = await import('@/lib/db/schema-billing')
    const { eq } = await import('drizzle-orm')
    const n = await withTenant(tenantId, async (tx) => (await tx.update(frrataInvoices).set({ total: 1 }).where(eq(frrataInvoices.id, mine.id)).returning({ id: frrataInvoices.id })).length)
    expect(n).toBe(0) // the redraft policy hides an issued invoice from any update
  })
})
