// A return AFTER the fee was billed (owner, 2026-11-12: a returned item isn't billable), on a REAL Postgres with the
// real roles. Skipped unless INT_DB_HOST is set. November's delivered order is billed on December's invoice; a return
// note in late November moves January's draft to give back the fee on what came back, once however often it is
// drafted; when the order later turns out not billable at all, February gives back only what is left (impact review
// 2026-11-12: this path had no test).
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const ist = (s: string) => new Date(`${s}+05:30`)

describe.skipIf(!host)('a return after billing gives the fee back once', () => {
  it('January credits the returned half; a redraft keeps it once; February gives back only the rest', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    const admin = await import('@/lib/admin/merchants')
    const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
    const tenantId = (await admin.createMerchant(staff, { name: 'Return Store', slug: `ret-${Date.now()}`, ownerEmail: 'o@ret.test', planCode: 'launch', trialEndsAt: null, now: ist('2026-10-01T00:00:00') })).id
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, creditNotes } = await import('@/lib/db/schema-orders')
    const { frrataFeeCredits } = await import('@/lib/db/schema-billing')
    const { draftInvoice } = await import('../draft')
    const { eq, and } = await import('drizzle-orm')
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1 })
    // The billing run issues an invoice; here the superuser marks it issued (its trigger guards issued invoices).
    const issue = (id: string, n: string) => su.begin(async (x) => { await x`set local session_replication_role = replica`; await x`update frrata_invoices set issued_at = now(), number = ${n} where id = ${id}` })
    const credits = () => withTenant(tenantId, (tx) => tx.select({ kind: frrataFeeCredits.kind, fee: frrataFeeCredits.fee }).from(frrataFeeCredits).where(eq(frrataFeeCredits.tenantId, tenantId)))
    try {
      const id = await withTenant(tenantId, async (tx) => (await tx.insert(orders).values({ tenantId, number: 1, paymentMethod: 'cod', placedAt: ist('2026-10-15T10:00:00'),
        confirmedAt: ist('2026-10-15T11:00:00'), packedAt: ist('2026-10-16T10:00:00'), merchandiseNet: 85714, invoiceNumber: 'RS/1',
        shippedAt: ist('2026-11-05T10:00:00'), deliveredAt: ist('2026-11-10T10:00:00') }).returning({ id: orders.id }))[0]!.id)
      // December bills 2% of ₹857.14 = ₹17.14, and is issued.
      const dec = await draftInvoice(tenantId, ist('2026-12-01T00:00:00'), ist('2026-11-15T09:00:00'))
      await issue(dec.invoiceId!, `RS-D-${Date.now()}`)
      // Half came back within the window (delivery + 15 days).
      await withTenant(tenantId, (tx) => tx.insert(creditNotes).values({ tenantId, orderId: id, number: 'RS/CN/1', againstInvoice: 'RS/1', reason: 'returned', kind: 'return',
        taxable: 42857, cgst: 0, sgst: 0, igst: 0, total: 42857, issuedAt: ist('2026-11-20T10:00:00'), issuedBy: 'aaaaaaaa-0000-0000-0000-0000000000ff' }))
      await draftInvoice(tenantId, ist('2027-01-01T00:00:00'), ist('2027-01-02T09:00:00'))
      const jan = await draftInvoice(tenantId, ist('2027-01-01T00:00:00'), ist('2027-01-02T10:00:00'))
      // ₹17.14 billed less ₹8.57 due on what was kept: ₹8.57 back, once.
      expect(await credits()).toEqual([{ kind: 'return', fee: 857 }])
      await issue(jan.invoiceId!, `RS-J-${Date.now()}`)
      // The order then came back whole (RTO): no longer billable, February gives back what is left, never the whole fee again.
      await withTenant(tenantId, (tx) => tx.update(orders).set({ rtoInitiatedAt: ist('2027-01-10T10:00:00') }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id))))
      await draftInvoice(tenantId, ist('2027-02-01T00:00:00'), ist('2027-02-02T09:00:00'))
      const all = (await credits()).sort((a, b) => a.kind.localeCompare(b.kind))
      expect(all).toEqual([{ kind: 'outcome', fee: 857 }, { kind: 'return', fee: 857 }])
    } finally { await su.end() }
  })
})
