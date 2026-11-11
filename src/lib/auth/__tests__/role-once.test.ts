// Speed review P7: requireMember / requireStaff look the caller up once per request (an argument-free cache), and
// each call still checks its own roles. A later edit that returned the cached lookup straight through would let a
// staff member pass CAN_MANAGE; this fails then (impact review 2026-11-08).
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <F extends (...a: never[]) => unknown>(f: F) => { let hit: unknown; let done = false; return ((...a: never[]) => (done ? hit : (done = true, hit = f(...a)))) as F } }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/public-env', () => ({ isAuthConfigured: () => true }))
vi.mock('@/lib/env', () => ({ isDatabaseConfigured: () => true, isAdminDatabaseConfigured: () => true }))
const getUser = vi.fn(async () => ({ data: { user: { id: 'u1', email: 'arjun@kesarstudio.in' } } }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: async () => ({ auth: { getUser } }) }))
const accessFor = vi.fn()
vi.mock('@/lib/db/platform', () => ({ accessFor }))

beforeEach(() => { vi.resetModules(); getUser.mockClear(); accessFor.mockReset() })

describe('requireMember', () => {
  it('one lookup per request; a staff member passes ANY_MEMBER and is refused CAN_MANAGE', async () => {
    accessFor.mockResolvedValue({ memberships: [{ tenantId: 't1', role: 'staff', supportSessionId: null }], staffRole: null })
    const { requireMember, ANY_MEMBER, CAN_MANAGE } = await import('../require-member')
    expect((await requireMember(ANY_MEMBER)).ok).toBe(true)
    expect(await requireMember(CAN_MANAGE)).toMatchObject({ ok: false, reason: 'no_access' })
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(accessFor).toHaveBeenCalledTimes(1)
  })
})

describe('requireStaff', () => {
  it('support passes ANY_STAFF and is refused ADMIN_ONLY, from one lookup', async () => {
    accessFor.mockResolvedValue({ memberships: [], staffRole: 'support' })
    const { requireStaff, ANY_STAFF, ADMIN_ONLY } = await import('../require-staff')
    expect((await requireStaff(ANY_STAFF)).ok).toBe(true)
    expect(await requireStaff(ADMIN_ONLY)).toMatchObject({ ok: false, reason: 'not_staff' })
    expect(accessFor).toHaveBeenCalledTimes(1)
  })
  it('someone who is not staff is refused', async () => {
    accessFor.mockResolvedValue({ memberships: [], staffRole: null })
    const { requireStaff, ANY_STAFF } = await import('../require-staff')
    expect(await requireStaff(ANY_STAFF)).toMatchObject({ ok: false, reason: 'not_staff' })
  })
})

describe('Admin layout: requireStaff then requireMember', () => {
  it('one Auth call and one access query between them (speed review 2026-11-11 MED 2)', async () => {
    accessFor.mockResolvedValue({ memberships: [{ tenantId: 't1', role: 'owner', supportSessionId: null }], staffRole: 'admin' })
    const { requireStaff, ANY_STAFF } = await import('../require-staff')
    const { requireMember, ANY_MEMBER } = await import('../require-member')
    expect((await requireStaff(ANY_STAFF)).ok).toBe(true)
    expect((await requireMember(ANY_MEMBER)).ok).toBe(true)
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(accessFor).toHaveBeenCalledTimes(1)
  })
})
