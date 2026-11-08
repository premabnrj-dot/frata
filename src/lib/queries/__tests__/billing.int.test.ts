// Plan and billing (billing B1) on a REAL Postgres with the real roles (migrated by scripts/verify/tenancy.sh). Skipped
// unless INT_DB_HOST is set (CI sets it). Money is for owners and admins only; "this month so far" is the billing run
// rolled back, so reading it writes nothing; billing details save through frata_app's column grants alone; Admin's
// "delivered this month" is the drafted count, the same figure the shop sees.
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const ist = (s: string) => new Date(`${s}+05:30`)

describe.skipIf(!host)('billing reads on a real database', () => {
  let tenantId = ''
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    const admin = await import('@/lib/admin/merchants')
    const slug = `b1-${Date.now()}`
    tenantId = (await admin.createMerchant(staff, { name: 'B1 Store', slug, host: `${slug}.frata.test`, ownerEmail: 'o@b1.test', planCode: 'launch', trialEndsAt: null, now: ist('2026-10-01T00:00:00') })).id
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    await withTenant(tenantId, (tx) => tx.insert(orders).values([1, 2, 3].map((n) => ({ tenantId, number: n, paymentMethod: 'cod' as const, placedAt: ist('2026-11-01T10:00:00'),
      confirmedAt: ist('2026-11-01T11:00:00'), packedAt: ist('2026-11-02T10:00:00'), invoiceNumber: `B1/26-27/${n}`, shippedAt: ist('2026-11-03T10:00:00'), deliveredAt: ist('2026-11-05T10:00:00'), merchandiseNet: 85714 }))))
  })

  it('owners and admins read it; staff and partners are refused', async () => {
    const q = await import('../billing')
    await expect(q.billingOverview({ tenantId, role: 'staff' })).rejects.toBeInstanceOf(q.NotForThisRole)
    await expect(q.billingOverview({ tenantId, role: 'partner' as never })).rejects.toBeInstanceOf(q.NotForThisRole)
    const o = await q.billingOverview({ tenantId, role: 'owner' }, ist('2026-11-20T12:00:00'))
    expect(o.plan).toMatchObject({ name: 'Launch', monthlyPrice: 149900, includedOrders: 150, feeBps: 200 })
    const e = o.estimate as Exclude<typeof o.estimate, 'busy' | null>
    expect(e.bill.usage).toEqual({ orders: 3, included: 150, over: false })
    expect(e.orders.map((x) => [x.number, x.fee])).toEqual([[3, 1714], [2, 1714], [1, 1714]])
    expect(o.details.saved).toBe(false)
  })

  it('reading the estimate writes nothing — with no draft yet, and with a draft the run already wrote', async () => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { frrataInvoices, frrataInvoiceFees, frrataInvoiceLines } = await import('@/lib/db/schema-billing')
    const { eq } = await import('drizzle-orm')
    const q = await import('../billing')
    const snap = () => withTenant(tenantId, async (tx) => ({
      inv: await tx.select({ id: frrataInvoices.id, draftedAt: frrataInvoices.draftedAt, total: frrataInvoices.total }).from(frrataInvoices).where(eq(frrataInvoices.tenantId, tenantId)),
      fees: (await tx.select({ orderId: frrataInvoiceFees.orderId }).from(frrataInvoiceFees).where(eq(frrataInvoiceFees.tenantId, tenantId))).map((f) => f.orderId).sort(),
      lines: (await tx.select({ id: frrataInvoiceLines.id }).from(frrataInvoiceLines).where(eq(frrataInvoiceLines.tenantId, tenantId))).length,
    }))
    await q.billingOverview({ tenantId, role: 'admin' }, ist('2026-11-20T12:00:00'))
    expect(await snap()).toEqual({ inv: [], fees: [], lines: 0 })
    // The run drafts December; a page view then redrafts it inside its rolled-back transaction: the rows come back.
    const { draftInvoice } = await import('@/lib/billing/draft')
    await draftInvoice(tenantId, ist('2026-12-01T00:00:00'), ist('2026-11-20T12:00:00'))
    const before = await snap()
    expect(before.fees).toHaveLength(3)
    await q.billingOverview({ tenantId, role: 'owner' }, ist('2026-11-21T12:00:00'))
    expect(await snap()).toEqual(before)
  })

  it('billing details save as frata_app (detail columns only) and read back; Admin counts what the draft counted', async () => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    const { billingAccounts } = await import('@/lib/db/schema-billing')
    const v = { legalName: 'B1 Store LLP', gstin: '27AAPFU0939F1ZV', address: 'Pune', stateCode: '27', email: 'acc@b1.test' }
    for (const legal of [v.legalName, 'B1 Store Pvt Ltd']) {
      await withTenant(tenantId, (tx) => tx.execute(sql`insert into ${billingAccounts} (tenant_id, legal_name, gstin, address, state_code, email, updated_at)
        values (${tenantId}, ${legal}, ${v.gstin}, ${v.address}, ${v.stateCode}, ${v.email}, now())
        on conflict (tenant_id) do update set legal_name = excluded.legal_name, gstin = excluded.gstin, address = excluded.address, state_code = excluded.state_code, email = excluded.email, updated_at = now()`))
    }
    const q = await import('../billing')
    const o = await q.billingOverview({ tenantId, role: 'owner' }, ist('2026-11-20T12:00:00'))
    expect(o.details).toEqual({ ...v, legalName: 'B1 Store Pvt Ltd', saved: true })
    // Inter-state now (Maharashtra shop, Frrata unregistered in test mode): IGST either way, and the run uses the GSTIN's state.
    expect((o.estimate as Exclude<typeof o.estimate, 'busy' | null>).bill.igst).toBeGreaterThan(0)
    const { draftInvoice } = await import('@/lib/billing/draft')
    const { nextMonthStartIST } = await import('@/domains/time/month')
    const now = ist('2026-11-20T12:00:00')
    await draftInvoice(tenantId, nextMonthStartIST(now), now)
    const admin = await import('@/lib/admin/merchants')
    const m = await admin.getMerchant(staff, tenantId, now)
    expect(m?.ordersThisMonth).toBe(3) // the three delivered on 5 Nov, as the December draft counted them
  })
})
