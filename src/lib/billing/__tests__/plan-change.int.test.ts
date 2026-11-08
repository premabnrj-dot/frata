// Billing B4's definer on a REAL Postgres (migrated by scripts/verify/tenancy.sh). Skipped unless INT_DB_HOST is set.
// An upgrade starts now; a downgrade waits for the 1st and can be cancelled; a change Frrata scheduled is never undone.
import { beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('plan changes on a real database', () => {
  let tenantId = ''
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    vi.resetModules()
    const admin = await import('@/lib/admin/merchants')
    const slug = `b4-${Date.now()}`
    tenantId = (await admin.createMerchant(staff, { name: 'B4 Store', slug, host: `${slug}.frata.test`, ownerEmail: 'o@b4.test', planCode: 'growth', trialEndsAt: null, now: new Date('2026-10-01T00:00:00Z') })).id
  })

  const change = async (code: string) => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    return withTenant(tenantId, async (tx) => (await tx.execute<{ starts_at: string; upgrade: boolean }>(sql`select * from app_change_plan(${code}, ${staff.userId}::uuid)`))[0]!)
  }
  const scheduled = async () => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    return withTenant(tenantId, async (tx) => (await tx.execute<{ n: number }>(sql`select count(*)::int n from tenant_plans where starts_at > now()`))[0]!.n)
  }

  it('a downgrade waits for the 1st, is replaced or cancelled; an upgrade starts now', async () => {
    const down = await change('launch')
    expect(down.upgrade).toBe(false)
    expect(new Date(down.starts_at).getTime()).toBeGreaterThan(Date.now())
    expect(await scheduled()).toBe(1)
    const { withTenant } = await import('@/lib/db/tenant')
    const { sql } = await import('drizzle-orm')
    await withTenant(tenantId, (tx) => tx.execute(sql`select app_cancel_plan_change()`))
    expect(await scheduled()).toBe(0)
    const up = await change('scale')
    expect(up.upgrade).toBe(true)
    expect(Math.abs(new Date(up.starts_at).getTime() - Date.now())).toBeLessThan(60_000)
    await expect(change('scale')).rejects.toThrow()
  })

  it('refuses while Frrata has a change scheduled', async () => {
    const postgres = (await import('postgres')).default
    const a = postgres(`postgresql://frata_admin:${pass}@${host}/${dbName}`, { max: 1 })
    await a`insert into tenant_plans (tenant_id, plan_version_id, starts_at, reason, created_by)
      select ${tenantId}, v.id, now() + interval '20 days', 'Agreed on a call', ${staff.userId}::uuid from plan_versions v join plans p on p.id = v.plan_id where p.code = 'launch' order by v.version desc limit 1`
    await a.end()
    await expect(change('launch')).rejects.toThrow()
  })
})
