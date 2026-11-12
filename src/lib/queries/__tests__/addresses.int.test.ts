// Shop addresses D·1 on a real Postgres: the rename limit the screen shows (renamesLeft over addressFacts) is the one the
// database enforces (app_change_shop_address), and an old name leads to the current address (tenantForHost). Skipped
// unless INT_DB_HOST is set. Uses the seed-free tenancy proof database; makes its own shop through Admin.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('shop names', () => {
  it('counts renames like the database, and old names lead to the current address', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    const admin = await import('@/lib/admin/merchants')
    const platform = await import('@/lib/db/platform')
    const { addressFacts } = await import('@/lib/queries/addresses')
    const { renamesLeft } = await import('@/domains/addresses/names')
    const { shopHost } = await import('@/lib/public-env')
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const, sessionId: '00000000-0000-4000-8000-000000000000', confirmedAt: new Date() }
    const base = `nm${Date.now() % 1_000_000}`
    const { id } = await admin.createMerchant(staff, { name: 'Names', slug: base, ownerEmail: 'o@names.test', planCode: 'launch', trialEndsAt: null, now: new Date() })
    const uid = '99999999-0000-0000-0000-00000000aa01'
    try {
      await su`insert into auth.users (id, email, email_confirmed_at) values (${uid}, 'o@names.test', now()) on conflict do nothing`
      await su`insert into members (tenant_id, user_id, role) values (${id}, ${uid}, 'owner')`
      // Before the first opening: free, and the name it left is never kept (it was never shared).
      const left = async () => { const f = (await addressFacts(id))!; return renamesLeft(f.firstOpenedAt, f.renamesUsed) }
      expect(await left()).toBeNull()
      expect(await platform.changeShopAddress(id, uid, `${base}-pre`)).toEqual({ ok: true })
      expect(await platform.slugAvailable(base)).toBe(true)
      expect(await platform.changeShopAddress(id, uid, base)).toEqual({ ok: true })
      await su`update shop_settings set published_at = now() - interval '1 minute' where tenant_id = ${id}`
      await su`update shop_settings set published_at = null where tenant_id = ${id}`
      // Opened once (then closed): two changes, and taking back an old name counts too (no back-and-forth).
      expect(await left()).toBe(2)
      expect(await platform.changeShopAddress(id, uid, `${base}-b`)).toEqual({ ok: true })
      expect(await left()).toBe(1)
      expect(await platform.changeShopAddress(id, uid, base)).toEqual({ ok: true })
      expect(await left()).toBe(0)
      expect(await platform.changeShopAddress(id, uid, `${base}-b`)).toEqual({ ok: false, error: 'no_renames_left' })
      const moved = await platform.tenantForHost(shopHost(`${base}-b`))
      expect(moved).toMatchObject({ id, movedTo: shopHost(base) })
      expect((await platform.tenantForHost(shopHost(base)))?.movedTo).toBeNull()
      expect(await platform.slugAvailable(`${base}-b`)).toBe(false)
      // Frrata's rename: the name it leaves leads nowhere.
      const adminDb = postgres(`postgresql://frata_admin:${pass}@${host}/${dbName}`, { max: 1, onnotice: () => {} })
      try {
        await su`insert into platform_staff (user_id, email, role) values (${staff.userId}, 'int@frata.test', 'admin') on conflict do nothing`
        await adminDb`select app_admin_rename_shop(${id}::uuid, ${staff.userId}::uuid, ${`${base}-fr`}, 'Copies another brand')`
      } finally { await adminDb.end() }
      expect(await platform.tenantForHost(shopHost(base))).toBeNull()
      expect(await admin.slugTaken(staff, base)).toBe(true)
    } finally {
      await su.end()
    }
  })
})
