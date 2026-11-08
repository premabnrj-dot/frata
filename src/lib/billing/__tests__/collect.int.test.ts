// Billing B3's database side on a REAL Postgres (migrated by scripts/verify/tenancy.sh). Skipped unless INT_DB_HOST is
// set. The due list, a notice that stands 25 h, one attempt at a time (payment row + outbox row together), outcomes that
// only move forward, and webhook events stored and applied once.
import { beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const ist = (s: string) => new Date(`${s}+05:30`)
const NOV = ist('2026-11-01T00:00:00')
const H = 3_600_000

describe.skipIf(!host)('collection on a real database', () => {
  let tenantId = '', invoiceId = ''
  const ORDER = `order_b3${Date.now()}`
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    process.env.BILLING_TEST_ISSUE = '1'
    vi.resetModules()
    const admin = await import('@/lib/admin/merchants')
    const slug = `b3-${Date.now()}`
    tenantId = (await admin.createMerchant(staff, { name: 'B3 Store', slug, host: `${slug}.frata.test`, ownerEmail: 'o@b3.test', planCode: 'launch', trialEndsAt: null, now: ist('2026-10-01T00:00:00') })).id
    const { draftInvoice } = await import('@/lib/billing/draft')
    await draftInvoice(tenantId, NOV)
    const b = await import('@/lib/admin/billing')
    const rows = await b.billingMonth(staff, NOV)
    const ready = b.toIssue(rows, NOV)
    await b.issueMonth(staff, NOV, { count: ready.count, total: ready.total })
    invoiceId = rows.find((r) => r.tenantId === tenantId)!.id
    // Autopay, as the console starts and completes it (bound to this shop).
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    await withTenant(tenantId, async (tx) => {
      await tx.execute(sql`select app_begin_mandate('cust_b3', ${ORDER}, 'upi', 1500000, ${staff.userId}::uuid)`)
      const [r] = await tx.execute<{ ok: boolean }>(sql`select app_complete_mandate(${ORDER}, 'token_b3') as ok`)
      expect(r!.ok).toBe(true)
    })
  })

  it('due → a notice → (25 h) → one attempt with its outbox row; a second is refused; the outcome only moves forward', async () => {
    const p = await import('@/lib/db/platform')
    const { nextStep } = await import('@/domains/billing/collect')
    const now = new Date()
    let d = (await p.billingDue()).find((x) => x.invoiceId === invoiceId)!
    expect([d.testMode, d.mandate, d.attempts, d.pending, d.noticeAt]).toEqual([true, true, 0, 0, null])
    const step = nextStep(d, now, true)
    expect(step.kind).toBe('notice')
    await p.billingNotice(invoiceId, 'debit_notice', d.due, step.kind === 'notice' ? step.debitAt : null)
    d = (await p.billingDue()).find((x) => x.invoiceId === invoiceId)!
    expect(d.noticeAt).not.toBeNull()
    expect(nextStep(d, now, true).kind).toBe('wait')
    expect(nextStep(d, new Date(now.getTime() + 26 * H), true)).toEqual({ kind: 'attempt', attempt: 1 })
    const pid = await p.beginBillingAttempt(invoiceId, 1)
    expect(pid).toBeTruthy()
    expect(await p.beginBillingAttempt(invoiceId, 2)).toBeNull() // one unsettled at a time
    const ctx = (await p.billingAttemptContext(pid!))!
    expect([ctx.customer, ctx.token, ctx.receipt.endsWith(':1')]).toEqual(['cust_b3', 'token_b3', true])
    await p.billingAttemptOrder(pid!, `${ORDER}_d1`)
    expect(await p.billingAttemptResult(`${ORDER}_d1`, 'pay_b3fail', false, 'declined')).toBe(true)
    expect(await p.billingAttemptResult(`${ORDER}_d1`, 'pay_b3fail', false, 'again')).toBe(false) // failed stays failed…
    d = (await p.billingDue()).find((x) => x.invoiceId === invoiceId)!
    expect([d.attempts, d.pending, !!d.lastFailedAt]).toEqual([1, 0, true])
    expect(nextStep(d, new Date(now.getTime() + 27 * H), true).kind).toBe('notice') // a fresh notice before the retry
    // …until captured, which is final.
    expect(await p.billingAttemptResult(`${ORDER}_d1`, 'pay_b3late', true, null)).toBe(true)
    expect(await p.billingAttemptResult(`${ORDER}_d1`, 'pay_b3late', false, 'x')).toBe(false)
  })

  it('a webhook event is stored once and applied once', async () => {
    const p = await import('@/lib/db/platform')
    const ev = `payment.failed:pay_x:${Date.now()}`
    const id = await p.storeBillingEvent(ev, 'payment.failed', { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_x', order_id: 'order_none' } } } })
    expect(id).toBeTruthy()
    expect(await p.storeBillingEvent(ev, 'payment.failed', {})).toBeNull()
    await p.applyBillingEvent(id!)
    await p.applyBillingEvent(id!)
  })
})
