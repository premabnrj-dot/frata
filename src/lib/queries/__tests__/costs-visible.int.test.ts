// Who sees ₹ (seesCosts via costsVisibleIn, Analytics A1·1) on a real Postgres under the row policies: a partner sees
// costs only while the shop has no owner; owners and admins always, staff never; and the read FAILS CLOSED when the
// transaction has no tenant (the policy hides every member row). Members are set up through ADMIN_URL (frata_app may
// not add members) and removed after. Skipped unless INT_DB_HOST is set.
import { afterAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111' // the proof's shop A: has its owner (handed over)
const NEW = 'c0575000-0000-0000-0000-0000000000a1' // a shop a partner is still building: no owner
const PARTNER = 'cccccccc-0000-0000-0000-0000000000a1'

describe.skipIf(!host)('costs visible', () => {
  const admin = host ? postgres(process.env.ADMIN_URL ?? `postgres://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} }) : null
  afterAll(async () => {
    if (!admin) return
    await admin`delete from members where user_id = ${PARTNER}`
    await admin`delete from tenants where id = ${NEW}`
    await admin.end()
  })

  it('a partner before handover only; owners and admins always; staff never; no tenant means no ₹', async () => {
    await admin!`insert into tenants (id, slug, name) values (${NEW}, 'costs-visible-int', 'Being built') on conflict (id) do nothing`
    // A partner shop row points at its partner person (members CHECK, partner teams T1a, drizzle/0121).
    const [p] = await admin!`insert into partners (user_id, email, name, phone, city, brands_now, terms_version, agreed_at, approved_at)
      values (${PARTNER}, 'costs-int@partner.test', 'P', '919845012345', 'Jaipur', '1-4', 1, now(), now())
      on conflict (user_id) do update set approved_at = coalesce(partners.approved_at, now()) returning id`
    const [pm] = await admin!`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${p!.id}, ${PARTNER}, 'costs-int@partner.test', 'owner', now())
      on conflict do nothing returning id`
    const memberId = pm?.id ?? (await admin!`select id from partner_members where user_id = ${PARTNER} and removed_at is null`)[0]!.id
    await admin!`insert into members (tenant_id, user_id, role, partner_member_id) values (${A}, ${PARTNER}, 'partner', ${memberId}), (${NEW}, ${PARTNER}, 'partner', ${memberId}) on conflict do nothing`
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { db } = await import('@/lib/db')
    const { costsVisibleIn } = await import('@/lib/queries/settings')
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      expect(await costsVisibleIn(tx, A, 'owner')).toBe(true)
      expect(await costsVisibleIn(tx, A, 'admin')).toBe(true)
      expect(await costsVisibleIn(tx, A, 'staff')).toBe(false)
      expect(await costsVisibleIn(tx, A, 'partner')).toBe(false) // handed over: A has its owner
    })
    await withTenant(NEW, async (tx) => {
      expect(await costsVisibleIn(tx, NEW, 'partner')).toBe(true) // still building: no owner yet
    })
    // No tenant set: every member row is hidden, so a partner gets no ₹ (never read as "no owner yet").
    await db().transaction(async (tx) => {
      expect(await costsVisibleIn(tx, NEW, 'partner')).toBe(false)
      throw ROLLBACK
    }).catch((err) => { if (err !== ROLLBACK) throw err })
  })
})
