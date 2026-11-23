// requireStudio (plan docs/plans/2026-11-22-v3a-runtime.md ruling k, R5): open only with the switch on, to Frrata staff
// with a live staff check who are also a live partner person with their partner check, on a store the switcher chose
// where they are the partner (never a support visit), both checks on the same browser session.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const s = {
  open: 'staff' as 'staff' | 'off', configured: true,
  staff: { ok: true, userId: 'u1', email: 'a@x.in', role: 'support', sessionId: 'b1', confirmedAt: new Date() } as Record<string, unknown>,
  partner: { ok: true, userId: 'u1', email: 'a@x.in', sessionId: 'b1', stepup: 'ph' } as Record<string, unknown>,
  member: { ok: true, userId: 'u1', membership: { tenantId: 't1', tenantName: 'Kesar', role: 'partner', supportSessionId: null } } as Record<string, unknown>,
  staffProof: { sessionId: 'b1', hash: 'sh' } as { sessionId: string; hash: string } | null,
  partnerProof: { sessionId: 'b1', hash: 'ph' } as { sessionId: string; hash: string } | null,
}
vi.mock('@/lib/env', () => ({ get STUDIO_OPEN() { return s.open }, isStudioConfigured: () => s.configured }))
vi.mock('@/lib/auth/require-staff', () => ({ ANY_STAFF: ['admin', 'support'], requireStaff: vi.fn(async () => s.staff) }))
vi.mock('@/lib/auth/require-partner', () => ({ requirePartner: vi.fn(async () => s.partner) }))
vi.mock('@/lib/auth/require-member', () => ({ requireMember: vi.fn(async (roles: string[]) => (s.member.ok && !roles.includes((s.member.membership as { role: string }).role) ? { ok: false } : s.member)) }))
vi.mock('@/lib/auth/session', () => ({ staffProof: vi.fn(async () => s.staffProof), partnerProof: vi.fn(async () => s.partnerProof), oncePerCall: <T>(w: () => Promise<T>) => w() }))
vi.mock('@/lib/db/tenant', () => ({ withTenant: vi.fn() }))
const { requireStudio } = await import('../with-studio')

const base = structuredClone({ ...s, staff: { ...s.staff, confirmedAt: 0 } })
describe('requireStudio', () => {
  beforeEach(() => {
    Object.assign(s, structuredClone(base))
  })
  it('opens for the staff partner on their store, with both hashes', async () => {
    expect(await requireStudio()).toMatchObject({ ok: true, userId: 'u1', tenantId: 't1', authSession: 'b1', staffHash: 'sh', partnerHash: 'ph' })
  })
  it('closed by the switch or without the key and agent', async () => {
    s.open = 'off'
    expect(await requireStudio()).toMatchObject({ ok: false, reason: 'closed' })
    s.open = 'staff'; s.configured = false
    expect(await requireStudio()).toMatchObject({ ok: false, reason: 'closed' })
  })
  it('refuses non-staff, a non-partner, two different people, a store role other than partner, a support visit', async () => {
    s.staff = { ok: false }
    expect((await requireStudio()).ok).toBe(false)
    Object.assign(s, structuredClone(base)); s.partner = { ok: false, reason: 'needs_passkey' }
    expect((await requireStudio()).ok).toBe(false)
    Object.assign(s, structuredClone(base)); s.partner = { ...s.partner, userId: 'u2' }
    expect((await requireStudio()).ok).toBe(false)
    Object.assign(s, structuredClone(base)); (s.member.membership as { role: string }).role = 'owner'
    expect((await requireStudio()).ok).toBe(false)
    Object.assign(s, structuredClone(base)); (s.member.membership as { supportSessionId: string | null }).supportSessionId = 'sv1'
    expect((await requireStudio()).ok).toBe(false)
  })
  // Both proofs read the session from sign-in today, so the last two cases guard the code's own comparison; the database's
  // match on session and hash (app_studio_partner, proof § 91) is the real check.
  it('refuses without a real step-up cookie, or checks on another browser session', async () => {
    s.staffProof = null
    expect((await requireStudio()).ok).toBe(false)
    Object.assign(s, structuredClone(base)); s.partnerProof = { sessionId: 'b2', hash: 'ph' }
    expect((await requireStudio()).ok).toBe(false)
    Object.assign(s, structuredClone(base)); s.staff = { ...s.staff, sessionId: 'b3' }
    expect((await requireStudio()).ok).toBe(false)
  })
})
