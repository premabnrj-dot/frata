// Billing B4's definer on a REAL Postgres (migrated by scripts/verify/tenancy.sh). Skipped unless INT_DB_HOST is set.
// An upgrade starts now; a downgrade waits for the 1st and can be cancelled; a change Frrata scheduled is never undone.
import { beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('plan changes on a real database', () => {
  let tenantId = '', owner = ''
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    vi.resetModules()
  })
  // Each test starts from its own shop on Growth (since 1 October), with its owner as a member.
  const fresh = async (trialEndsAt: Date | null = null) => {
    const admin = await import('@/lib/admin/merchants')
    const slug = `b4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    tenantId = (await admin.createMerchant(staff, { name: 'B4 Store', slug, ownerEmail: 'o@b4.test', planCode: 'growth', trialEndsAt, now: new Date('2026-10-01T00:00:00Z') })).id
    // The owner as a member (an invite is not one): written as the database owner, as sign-up does.
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1 })
    owner = crypto.randomUUID()
    await su`insert into auth.users (id, email, email_confirmed_at) values (${owner}, ${`o-${slug}@b4.test`}, now())`
    await su`insert into members (tenant_id, user_id, role) values (${tenantId}, ${owner}, 'owner')`
    await su.end()
  }

  const change = async (code: string) => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    return withTenant(tenantId, async (tx) => (await tx.execute<{ starts_at: string; upgrade: boolean }>(sql`select * from app_change_plan(${code}, ${owner}::uuid)`))[0]!)
  }
  const scheduled = async () => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    return withTenant(tenantId, async (tx) => (await tx.execute<{ n: number }>(sql`select count(*)::int n from tenant_plans where starts_at > now()`))[0]!.n)
  }

  it('the next invoice bills the upgrade’s difference as its own line, the figure the dialog showed', async () => {
    await fresh()
    const { draftInvoice, planBilledIn } = await import('@/lib/billing/draft')
    const { planChangeAdds } = await import('@/domains/billing/bill')
    const { monthStartIST, nextMonthStartIST } = await import('@/domains/time/month')
    const { withTenant } = await import('@/lib/db/tenant')
    const now = new Date(), M = monthStartIST(now), N = nextMonthStartIST(now)
    await draftInvoice(tenantId, M) // this month, at Growth, in advance (as issued on the 1st)
    const billed = await withTenant(tenantId, (tx) => planBilledIn(tx, tenantId, M))
    expect(billed).toBeGreaterThan(0)
    const growth = { startsAt: new Date('2026-10-01T00:00:00Z'), trialEndsAt: null, customMonthlyPrice: null, planVersion: { planCode: 'growth' as const, name: 'Growth', monthlyPrice: 499900 as never, includedOrders: 1500, feeBps: 100 } }
    const at = new Date()
    const shown = planChangeAdds([growth], { planCode: 'scale', name: 'Scale', monthlyPrice: 1499900 as never, includedOrders: 5000, feeBps: 50 }, at, M, N, billed)
    const up = await change('scale')
    expect(up.upgrade).toBe(true)
    const d = await draftInvoice(tenantId, N)
    if (!d.invoiceId) throw new Error('not drafted')
    const line = d.bill.lines.find((l) => l.kind === 'change')!
    // The definer's now() is a few ms after the page's `at`: within one paisa per day of rounding.
    expect(Math.abs(line.taxable - shown)).toBeLessThanOrEqual(1)
    // This month's own plan lines are what was billed in advance; the change line is next month's.
    expect(await withTenant(tenantId, (tx) => planBilledIn(tx, tenantId, M))).toBe(billed)
    // Back to Growth: on the next 1st (orders shipped under Scale keep Scale's rate).
    const down = await change('growth')
    expect(new Date(down.starts_at).getTime()).toBe(N.getTime())
    const { sql } = await import('drizzle-orm')
    await withTenant(tenantId, (tx) => tx.execute(sql`select app_cancel_plan_change(${owner}::uuid)`))
  })

  it('a downgrade waits for the 1st, is replaced or cancelled; an upgrade starts now', async () => {
    await fresh()
    const down = await change('launch')
    expect(down.upgrade).toBe(false)
    expect(new Date(down.starts_at).getTime()).toBeGreaterThan(Date.now())
    expect(await scheduled()).toBe(1)
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    await withTenant(tenantId, (tx) => tx.execute(sql`select app_cancel_plan_change(${owner}::uuid)`))
    expect(await scheduled()).toBe(0)
    const up = await change('scale')
    expect(up.upgrade).toBe(true)
    expect(Math.abs(new Date(up.starts_at).getTime() - Date.now())).toBeLessThan(60_000)
    await expect(change('scale')).rejects.toThrow()
  })

  it('an upgrade during a trial waits until the trial is over, and carries no trial', async () => {
    const end = new Date(Date.now() + 10 * 86_400_000)
    await fresh(end)
    const up = await change('scale')
    expect(up.upgrade).toBe(true)
    expect(new Date(up.starts_at).getTime()).toBe(end.getTime())
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    const [row] = await withTenant(tenantId, (tx) => tx.execute<{ trial_ends_at: string | null }>(sql`select trial_ends_at from tenant_plans where starts_at > now()`))
    expect(row!.trial_ends_at).toBeNull()
  })

  it('only the owner or an admin may change it', async () => {
    await fresh()
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    await expect(withTenant(tenantId, (tx) => tx.execute(sql`select * from app_change_plan('launch', ${staff.userId}::uuid)`))).rejects.toThrow()
  })

  it('refuses while Frrata has a change scheduled', async () => {
    await fresh()
    const postgres = (await import('postgres')).default
    const a = postgres(`postgresql://frata_admin:${pass}@${host}/${dbName}`, { max: 1 })
    await a`insert into tenant_plans (tenant_id, plan_version_id, starts_at, reason, created_by)
      select ${tenantId}, v.id, now() + interval '20 days', 'Agreed on a call', ${staff.userId}::uuid from plan_versions v join plans p on p.id = v.plan_id where p.code = 'launch' order by v.version desc limit 1`
    await a.end()
    await expect(change('launch')).rejects.toThrow()
  })
})
