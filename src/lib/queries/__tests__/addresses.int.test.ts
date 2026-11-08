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
    const su = postgres(`postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const }
    const base = `nm${Date.now() % 1_000_000}`
    const { id } = await admin.createMerchant(staff, { name: 'Names', slug: base, ownerEmail: 'o@names.test', planCode: 'launch', trialEndsAt: null, now: new Date() })
    const uid = '99999999-0000-0000-0000-00000000aa01'
    try {
      await su`insert into auth.users (id, email, email_confirmed_at) values (${uid}, 'o@names.test', now()) on conflict do nothing`
      await su`insert into members (tenant_id, user_id, role) values (${id}, ${uid}, 'owner')`
      await su`update shop_settings set published_at = now() - interval '1 minute' where tenant_id = ${id}`
      const left = async () => { const f = (await addressFacts(id))!; return renamesLeft(f.firstOpenedAt, f.names) }
      expect(await left()).toBe(2)
      expect(await platform.changeShopAddress(id, uid, `${base}-b`)).toEqual({ ok: true })
      expect(await left()).toBe(1)
      // Taking back an old name while a change is left costs nothing, in SQL and on screen alike.
      expect(await platform.changeShopAddress(id, uid, base)).toEqual({ ok: true })
      expect(await left()).toBe(1)
      expect(await platform.changeShopAddress(id, uid, `${base}-c`)).toEqual({ ok: true })
      expect(await left()).toBe(0)
      expect(await platform.changeShopAddress(id, uid, `${base}-d`)).toEqual({ ok: false, error: 'no_renames_left' })
      expect(await platform.changeShopAddress(id, uid, base)).toEqual({ ok: false, error: 'no_renames_left' })
      const moved = await platform.tenantForHost(shopHost(`${base}-b`))
      expect(moved).toMatchObject({ id, movedTo: shopHost(`${base}-c`) })
      expect((await platform.tenantForHost(shopHost(`${base}-c`)))?.movedTo).toBeNull()
      expect(await platform.slugAvailable(`${base}-c`)).toBe(false)
    } finally {
      await su.end()
    }
  })
})
