// G·2's one minting path on a real Postgres (ADR-0018's build-key amendment, points 1–2): who may mint, the partner the
// key follows, its end by purpose, the store's ceiling, the audit row, and that the definer then names the store.
// Skipped unless INT_DB_HOST is set (the tenancy proof database: npm run verify:tenancy first).
import { describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('mintBuildKey', () => {
  it('mints for api.manage only, follows the partner, ends by purpose, stops at the ceiling, and is audited', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { mintBuildKey } = await import('../build-keys')
    const { withTenant } = await import('@/lib/db/tenant')
    const { storefrontKeyRow } = await import('@/lib/db/platform')
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const t = randomUUID(), owner = randomUUID(), staff = randomUUID(), lead = randomUUID(), stranger = randomUUID(), partner = randomUUID(), pm = randomUUID()
    const tag = String(Date.now() % 1_000_000)
    try {
      await su`insert into tenants (id, slug, name) values (${t}, ${`mint${tag}`}, 'Mint')`
      await su`insert into shop_settings (tenant_id, pickup_pincode) values (${t}, '452009')`
      await su`insert into auth.users (id, email, email_confirmed_at) values (${lead}, ${`lead${tag}@mint.test`}, now())`
      await su`insert into partners (id, user_id, email, name, business_name, phone, city, brands_now, terms_version, agreed_at, approved_at)
        values (${partner}, ${randomUUID()}, ${`p${tag}@mint.test`}, 'Asha', 'Mint Studio', '919876500000', 'Indore', '0', 1, now(), now())`
      await su`insert into partner_members (id, partner_id, user_id, email, role, accepted_at) values (${pm}, ${partner}, ${lead}, ${`lead${tag}@mint.test`}, 'lead', now())`
      await su`insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (${t}, ${partner}, 2000, 24, 90)`
      await su`insert into partner_assignments (partner_member_id, tenant_id) values (${pm}, ${t})`
      await su`insert into members (tenant_id, user_id, role) values (${t}, ${owner}, 'owner'), (${t}, ${staff}, 'staff')`
      await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${t}, ${lead}, 'partner', ${pm})`
      const mint = (who: { userId: string; role: string; support?: boolean }, purpose: 'session' | 'preview' | 'developer', hours?: number) =>
        withTenant(t, (tx) => mintBuildKey(tx, { tenantId: t, userId: who.userId, email: 'x@mint.test', role: who.role, support: !!who.support }, { purpose, name: 'Kabir’s computer', hours }))

      expect(await mint({ userId: owner, role: 'owner', support: true }, 'session')).toEqual({ ok: false, why: 'not_allowed' })
      expect(await mint({ userId: staff, role: 'staff' }, 'session')).toEqual({ ok: false, why: 'not_allowed' })
      expect(await mint({ userId: stranger, role: 'owner' }, 'session')).toEqual({ ok: false, why: 'not_allowed' }) // no members row here

      const own = await mint({ userId: owner, role: 'owner' }, 'session')
      expect(own.ok).toBe(true)
      if (!own.ok) return
      expect(own.key).toMatch(/^frs_build_[0-9A-Za-z]{38}$/)
      const [row] = await su`select kind, purpose, partner_id, hash, expires_at - created_at as span from storefront_keys where id = ${own.id}`
      expect(row).toMatchObject({ kind: 'build', purpose: 'session', partner_id: null, hash: createHash('sha256').update(own.key).digest('hex') })
      expect(String(row!.span)).toMatch(/^(1 day|24:00:00)/)
      expect((await storefrontKeyRow(row!.hash as string))?.tenantId).toBe(t) // before opening, no Website: answers
      const [audit] = await su`select action, detail from audit_events where tenant_id = ${t} and target = ${own.id}`
      expect(audit).toMatchObject({ action: 'storefront_key.mint', detail: { fields: ['purpose', 'name'] } })

      const theirs = await mint({ userId: lead, role: 'partner' }, 'preview', 10_000)
      expect(theirs.ok).toBe(true)
      if (!theirs.ok) return
      const [p] = await su`select partner_id, extract(epoch from expires_at - created_at)::int as secs from storefront_keys where id = ${theirs.id}`
      expect(p).toMatchObject({ partner_id: partner, secs: 30 * 86_400 }) // a preview's hours clamp to 30 days

      await su`insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at)
        select ${t}, 'build', 'session', 'Filler', md5(g::text || ${tag}) || md5(${tag} || g::text), 'frs_build_aaaaaa', ${owner}, now() + interval '1 hour' from generate_series(1, 48) g`
      expect(await mint({ userId: owner, role: 'owner' }, 'session')).toEqual({ ok: false, why: 'full' })
    } finally {
      await su`delete from audit_events where tenant_id = ${t}`
      await su`delete from storefront_keys where tenant_id = ${t}`
      await su`delete from members where tenant_id = ${t}`
      await su`delete from partner_assignments where tenant_id = ${t}`
      await su`delete from partner_links where tenant_id = ${t}`
      await su`delete from partner_members where id = ${pm}`
      await su`delete from partners where id = ${partner}`
      await su`delete from auth.users where id = ${lead}`
      await su`delete from shop_settings where tenant_id = ${t}`
      await su`delete from tenants where id = ${t}`
      await su.end()
    }
  }, 60_000)
})
