// studioStoreIds (Open Studio on Partner workspace › Clients, 2026-11-24): the stores Studio's door would admit this
// person to. Same rule as the door: Studio on, the person both Frrata staff and a live partner person, their own
// partner stores only. Anyone else gets the empty set, so a button never shows who is refused.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const T1 = '11111111-1111-4111-8111-111111111111', T2 = '22222222-2222-4222-8222-222222222222'
const st = {
  open: 'staff', configured: true,
  staff: { ok: true, userId: 'u1', sessionId: 's1' } as Record<string, unknown>,
  partner: { ok: true, userId: 'u1', sessionId: 's1' } as Record<string, unknown>,
  memberships: [] as { tenantId: string; tenantName: string; role: string; supportSessionId: string | null }[],
}
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ get STUDIO_OPEN() { return st.open }, isStudioConfigured: () => st.configured }))
vi.mock('@/lib/db', () => ({}))
vi.mock('@/lib/db/tenant', () => ({ withTenant: vi.fn() }))
vi.mock('@/lib/auth/require-member', () => ({ requireMember: vi.fn() }))
vi.mock('@/lib/auth/require-partner', () => ({ requirePartner: vi.fn(async () => st.partner) }))
vi.mock('@/lib/auth/require-staff', () => ({ ANY_STAFF: [], requireStaff: vi.fn(async () => st.staff) }))
vi.mock('@/lib/auth/session', () => ({
  oncePerCall: <T,>(w: () => Promise<T>) => w(), accessOf: vi.fn(async () => ({ memberships: st.memberships })),
  partnerProof: vi.fn(), staffProof: vi.fn(), passkeys: vi.fn(),
}))
vi.mock('@/lib/admin/passkeys', () => ({ gateState: vi.fn() }))
const { studioStoreIds } = await import('../with-studio')

const m = (tenantId: string, role = 'partner', supportSessionId: string | null = null) => ({ tenantId, tenantName: 'S', role, supportSessionId })

describe('studioStoreIds', () => {
  beforeEach(() => {
    st.open = 'staff'; st.configured = true
    st.staff = { ok: true, userId: 'u1', sessionId: 's1' }; st.partner = { ok: true, userId: 'u1', sessionId: 's1' }
    st.memberships = [m(T1), m(T2, 'owner')]
  })
  it('admitted: staff and a live partner person see their partner stores only', async () => {
    expect([...await studioStoreIds()]).toEqual([T1])
  })
  it('a passkey check still to make does not hide it (the entry asks for the step)', async () => {
    st.staff = { ok: false, reason: 'needs_passkey', identity: { userId: 'u1', sessionId: 's1' } }
    expect([...await studioStoreIds()]).toEqual([T1])
  })
  it('not Frrata staff: nothing', async () => {
    st.staff = { ok: false, reason: 'forbidden' }
    expect((await studioStoreIds()).size).toBe(0)
  })
  it('not a partner person (or another person): nothing', async () => {
    st.partner = { ok: false, reason: 'not_partner' }
    expect((await studioStoreIds()).size).toBe(0)
    st.partner = { ok: true, userId: 'u2', sessionId: 's1' }
    expect((await studioStoreIds()).size).toBe(0)
  })
  it('not a partner on that store, a Builder, a support visit: not in the set', async () => {
    st.memberships = [m(T1, 'builder'), m(T2, 'partner', 'visit-1')]
    expect((await studioStoreIds()).size).toBe(0)
    st.memberships = [m(T2, 'owner')]
    expect((await studioStoreIds()).size).toBe(0)
  })
  it('Studio off or not configured: nothing', async () => {
    st.open = 'off'
    expect((await studioStoreIds()).size).toBe(0)
    st.open = 'staff'; st.configured = false
    expect((await studioStoreIds()).size).toBe(0)
  })
})
