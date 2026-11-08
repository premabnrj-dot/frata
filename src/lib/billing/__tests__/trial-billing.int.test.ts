// Trials TR0·3 on a REAL Postgres (migrated by scripts/verify/tenancy.sh; INT_DB_HOST set): a shop whose trial runs
// on the 1st gets no plan on that month's invoice; the next invoice makes up the plan after the trial, by days; the due
// list carries the trial end, so collection never debits during it. Fees are billed as usual (owner, 2026-11-08).
import { beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('a trial shop\'s invoices', () => {
  let tenantId = ''
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    vi.resetModules()
    const admin = await import('@/lib/admin/merchants')
    const slug = `tr-${Date.now()}`
    tenantId = (await admin.createMerchant(staff, { name: 'Trial Store', slug, host: `${slug}.frata.test`, ownerEmail: 'o@tr.test', planCode: 'growth', trialEndsAt: null, now: new Date('2026-10-01T00:00:00Z') })).id
    // A 30-day trial that went live on 3 November (IST): it ends at the end of 3 December.
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1 })
    await su`insert into shop_trials (tenant_id, days, open_window_days, signed_up_at, started_at) values (${tenantId}, 30, 15, '2026-11-02T12:00:00+05:30', '2026-11-03T12:00:00+05:30')`
    await su`select app_trial_recompute(${tenantId})`
    await su.end()
  })

  it('November and December: no plan (the trial runs on the 1st); January: December after the trial, by days', async () => {
    const { draftInvoice } = await import('@/lib/billing/draft')
    const { monthOfYM } = await import('@/domains/time/month')
    const nov = await draftInvoice(tenantId, monthOfYM('2026-11')!)
    const dec = await draftInvoice(tenantId, monthOfYM('2026-12')!)
    const jan = await draftInvoice(tenantId, monthOfYM('2027-01')!)
    if (!nov.invoiceId || !dec.invoiceId || !jan.invoiceId) throw new Error('not drafted')
    expect(nov.bill.lines.some((l) => l.kind === 'plan' || l.kind === 'change')).toBe(false)
    expect(dec.bill.lines.some((l) => l.kind === 'plan')).toBe(false)
    // 4–31 December at Growth by days. (The billing pause is off until the storefront pause ships, TR1 task 9: a shop
    // that still sells pays its plan.)
    expect(jan.bill.lines.find((l) => l.kind === 'change')!.taxable).toBe(Math.round(499900 * 28 / 31))
    expect(jan.bill.lines.find((l) => l.kind === 'plan')!.taxable).toBe(499900)
  })

  it('with autopay set up before the pause: 4–31 December by days, and January in advance', async () => {
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1 })
    await su`insert into billing_accounts (tenant_id, mandate_token_id, mandate_method, mandate_max, mandate_at) values (${tenantId}, 'token_tr', 'upi', 1500000, '2026-12-01T10:00:00+05:30')
      on conflict (tenant_id) do update set mandate_token_id = excluded.mandate_token_id, mandate_at = excluded.mandate_at, mandate_revoked_at = null`
    await su.end()
    const { draftInvoice } = await import('@/lib/billing/draft')
    const { monthOfYM } = await import('@/domains/time/month')
    const jan = await draftInvoice(tenantId, monthOfYM('2027-01')!)
    if (!jan.invoiceId) throw new Error('not drafted')
    expect(jan.bill.lines.find((l) => l.kind === 'change')!.taxable).toBe(Math.round(499900 * 28 / 31))
    expect(jan.bill.lines.find((l) => l.kind === 'plan')!.taxable).toBe(499900)
  })

  it('the SQL day rule ends the trial after its last IST day', async () => {
    const { db } = await import('@/lib/db')
    const { sql } = await import('drizzle-orm')
    const [r] = await db().execute<{ e: string }>(sql`select app_ist_day_end_after('2026-11-03T12:00:00+05:30'::timestamptz, 30) as e`)
    expect(new Date(r!.e).toISOString()).toBe(new Date('2026-12-04T00:00:00+05:30').toISOString())
  })
})
