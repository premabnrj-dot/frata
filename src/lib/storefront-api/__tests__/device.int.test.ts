// G·3 on a real Postgres: a developer's device sign-in from start to the build key — pending until confirmed, a stale
// passkey check refused, a non-member confirms nothing, the key minted once as the person, and the definer then names
// the store. Skipped unless INT_DB_HOST is set (the tenancy proof database: npm run verify:tenancy first).
import { describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('the device sign-in', () => {
  it('starts, waits, is confirmed by a member with a fresh check, and gives the key once', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { startDeviceSignIn, confirmDeviceCode, deviceCodeFor, pollDeviceSignIn } = await import('../device')
    const { storefrontKeyRow } = await import('@/lib/db/platform')
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const t = randomUUID(), owner = randomUUID(), stranger = randomUUID(), staff = randomUUID()
    const slug = `dev${String(Date.now() % 1_000_000)}`
    const ip = `198.51.100.${Date.now() % 250}`
    try {
      await su`insert into tenants (id, slug, name) values (${t}, ${slug}, 'Dev')`
      await su`insert into shop_settings (tenant_id, pickup_pincode) values (${t}, '452009')`
      await su`insert into auth.users (id, email, email_confirmed_at) values (${owner}, ${`riya${slug}@dev.test`}, now())`
      await su`insert into members (tenant_id, user_id, role) values (${t}, ${owner}, 'owner'), (${t}, ${staff}, 'staff')`
      const now = new Date()
      const s = await startDeviceSignIn(slug, ip)
      expect(s).not.toBeNull()
      if (!s) return
      expect(s.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect(await pollDeviceSignIn(s.device, ip)).toEqual({ status: 'pending' })
      expect(await confirmDeviceCode({ userId: owner, email: 'riya@dev.test', confirmedAt: new Date(now.getTime() - 6 * 60_000) }, s.code, now)).toBe('check_again')
      expect(await confirmDeviceCode({ userId: stranger, email: 'x@dev.test', confirmedAt: now }, s.code, now)).toBe('not_found')
      // A member without api.manage sees nothing to confirm and confirms nothing; the owner sees the store's name first.
      expect(await deviceCodeFor(staff, s.code)).toBe('not_allowed')
      expect(await confirmDeviceCode({ userId: staff, email: 'staff@dev.test', confirmedAt: now }, s.code, now)).toBe('not_allowed')
      expect(await deviceCodeFor(owner, s.code)).toEqual({ storeName: 'Dev' })
      expect(await confirmDeviceCode({ userId: owner, email: 'riya@dev.test', confirmedAt: now }, s.code.toLowerCase().replace('-', ' '), now)).toBe('ok')
      // A mint that can't finish (the store at its ceiling) gives the code back: the next poll tries again.
      await su`insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at)
        select ${t}, 'build', 'session', 'Filler', md5(g::text || ${slug}) || md5(${slug} || g::text), 'frs_build_aaaaaa', ${owner}, now() + interval '1 hour' from generate_series(1, 50) g`
      expect(await pollDeviceSignIn(s.device, ip)).toEqual({ status: 'busy' })
      await su`delete from storefront_keys where tenant_id = ${t} and name = 'Filler'`
      const got = await pollDeviceSignIn(s.device, ip)
      expect(got?.status).toBe('ok')
      if (got?.status !== 'ok') return
      expect(got.key).toMatch(/^frs_build_/)
      const [row] = await su`select kind, purpose, name, created_by from storefront_keys where hash = ${createHash('sha256').update(got.key).digest('hex')}`
      expect(row).toMatchObject({ kind: 'build', purpose: 'developer', name: `riya${slug}’s computer`, created_by: owner })
      expect((await storefrontKeyRow(createHash('sha256').update(got.key).digest('hex')))?.tenantId).toBe(t)
      expect(await pollDeviceSignIn(s.device, ip)).toBeNull() // once
      const [audit] = await su`select count(*)::int n from audit_events where tenant_id = ${t} and action = 'build_key.device_confirmed'`
      expect(audit!.n).toBe(1)
    } finally {
      await su`delete from audit_events where tenant_id = ${t}`
      await su`delete from storefront_keys where tenant_id = ${t}`
      await su`delete from build_key_device_codes where store_slug = ${slug}`
      await su`delete from members where tenant_id = ${t}`
      await su`delete from shop_settings where tenant_id = ${t}`
      await su`delete from tenants where id = ${t}`
      await su`delete from auth.users where id = ${owner}`
      await su.end()
    }
  }, 60_000)
})
