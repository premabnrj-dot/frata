// Runs the Admin library against a REAL Postgres with the real roles, after
// scripts/verify/tenancy.sh has migrated it. Skipped unless INT_DB_HOST is set
// (CI sets it). Uses roles frata_app and frata_admin; local trust auth.
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('Admin library on a real database', () => {
  let admin: typeof import('../merchants')
  let support: typeof import('../support')
  let plans: typeof import('../plans')
  let staffLib: typeof import('../staff')
  let platform: typeof import('@/lib/db/platform')
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const, sessionId: '00000000-0000-4000-8000-000000000000', confirmedAt: new Date() }

  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    admin = await import('../merchants')
    support = await import('../support')
    plans = await import('../plans')
    staffLib = await import('../staff')
    platform = await import('@/lib/db/platform')
  })

  it('creates a merchant with an owner invite and a plan, and lists it', async () => {
    const slug = `int-${Date.now()}`
    const { id } = await admin.createMerchant(staff, {
      name: 'Int Store', slug,
      ownerEmail: 'Owner@Int.Test', planCode: 'growth', trialEndsAt: null, now: new Date(),
    })
    const m = await admin.getMerchant(staff, id, new Date())
    expect(m?.tenant.name).toBe('Int Store')
    // The platform address is computed from the name, never a stored row (shop addresses D·0).
    const { shopHost } = await import('@/lib/public-env')
    expect(m?.host).toBe(shopHost(slug))
    expect(m?.current?.code).toBe('growth')
    expect(m?.current?.v.feeBps).toBe(100)
    expect(m?.invites[0]?.email).toBe('owner@int.test')
    const list = await admin.listMerchants(staff, { page: 1, q: 'Int Store', now: new Date() })
    expect(list.rows.map((r) => r.id)).toContain(id)
    expect(list.rows.find((r) => r.id === id)?.pendingInvite).toBe('owner@int.test')
  })

  it('starts a support visit that app_access_for honours, and ends it', async () => {
    const { rows } = await admin.listMerchants(staff, { page: 1, q: 'Int Store', now: new Date() })
    const tenantId = rows[0]!.id
    // The staffer must be in platform_staff for the visit to count.
    const { adminDb } = await import('@/lib/db/admin')
    const { platformStaff } = await import('@/lib/db/schema')
    await adminDb().insert(platformStaff).values({ userId: staff.userId, email: staff.email, role: 'admin' }).onConflictDoNothing()

    const r = await support.startSupport(staff, { tenantId, reason: 'setup_help', note: 'int', minutes: 30, now: new Date() })
    expect('id' in r).toBe(true)
    // Staff passkeys (2026-11-12): the visit counts only with a live passkey step-up on the same session. The staff_*
    // tables have no grant to any app role, so the step-up is seeded as the superuser.
    const { default: postgres } = await import('postgres')
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const [k] = await su<{ id: string }[]>`insert into staff_passkeys (user_id, credential_id, public_key, name) values (${staff.userId}, ${'int-' + Date.now()}, 'int', 'int') returning id`
    await su`insert into staff_stepups (user_id, session_id, passkey_id, token_hash, expires_at) values (${staff.userId}, ${staff.sessionId}, ${k!.id}, 'int-hash', now() + interval '1 hour')`
    await su.end()
    const none = await platform.accessFor(staff.userId)
    expect(none.staffConfirmedAt).toBeNull()
    expect(none.memberships.find((m) => m.tenantId === tenantId)).toBeUndefined() // no step-up: no visit
    const a = await platform.accessFor(staff.userId, staff.sessionId, 'int-hash')
    expect(a.staffRole).toBe('admin')
    expect(a.staffConfirmedAt).not.toBeNull()
    expect(a.memberships.find((m) => m.tenantId === tenantId)?.supportSessionId).toBeTruthy()

    expect(await support.endSupport(staff, new Date())).toBe(tenantId)
    const after = await platform.accessFor(staff.userId, staff.sessionId, 'int-hash')
    expect(after.memberships.find((m) => m.tenantId === tenantId)).toBeUndefined()
  })

  it('makes a new plan version without touching the old one, and moves a store to it', async () => {
    const before = (await plans.listPlans(staff)).find((p) => p.code === 'scale')!
    const v = await plans.newPlanVersion(staff, 'scale', { monthlyPrice: 1_299_900, includedOrders: 6000, feeBps: 50, features: ['rto_shield'] })
    expect(v.version).toBe(before.versions[0]!.version + 1)
    const after = (await plans.listPlans(staff)).find((p) => p.code === 'scale')!
    expect(after.versions.find((x) => x.id === before.versions[0]!.id)?.monthlyPrice).toBe(before.versions[0]!.monthlyPrice)

    const { rows } = await admin.listMerchants(staff, { page: 1, q: 'Int Store', now: new Date() })
    await plans.changeTenantPlan(staff, rows[0]!.id, { code: 'scale', startsAt: new Date(Date.now() + 1000), trialEndsAt: null, customMonthlyPrice: null, reason: null })
    const m = await admin.getMerchant(staff, rows[0]!.id, new Date(Date.now() + 5000))
    expect(m?.current?.code).toBe('scale')
    expect(m?.current?.v.version).toBe(v.version)
  })

  it('refuses to add staff who never signed in, and will not remove yourself', async () => {
    expect(await staffLib.addStaff(staff, 'nobody@nowhere.test', 'support')).toEqual({ error: expect.stringMatching(/signed in/) })
    expect(await staffLib.removeStaff(staff, staff.userId, new Date())).toEqual({ error: 'You cannot remove yourself' })
  })
})
