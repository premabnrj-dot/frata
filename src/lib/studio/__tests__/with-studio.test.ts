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
  staffPasskeys: 2,
  memberships: [{ tenantId: 't1', tenantName: 'Kesar', role: 'partner', supportSessionId: null }] as { tenantId: string; tenantName: string; role: string; supportSessionId: string | null }[],
  reads: 0,
  off: false,
}
vi.mock('@/lib/env', () => ({ get STUDIO_OPEN() { return s.open }, isStudioConfigured: () => s.configured }))
vi.mock('@/lib/auth/require-staff', () => ({ ANY_STAFF: ['admin', 'support'], requireStaff: vi.fn(async () => s.staff) }))
vi.mock('@/lib/auth/require-partner', () => ({ requirePartner: vi.fn(async () => s.partner) }))
vi.mock('@/lib/auth/require-member', () => ({ requireMember: vi.fn(async (roles: string[]) => (s.member.ok && !roles.includes((s.member.membership as { role: string }).role) ? { ok: false } : s.member)) }))
vi.mock('@/lib/auth/session', () => ({ staffProof: vi.fn(async () => s.staffProof), partnerProof: vi.fn(async () => s.partnerProof), oncePerCall: <T>(w: () => Promise<T>) => w(),
  accessOf: vi.fn(async () => { s.reads++; return { memberships: s.memberships } }), passkeys: vi.fn(async () => ({ off: s.off, since: null, by: null })) }))
vi.mock('@/lib/admin/passkeys', () => ({ gateState: vi.fn(async () => { s.reads++; return { passkeys: s.staffPasskeys, request: null } }) }))
vi.mock('@/lib/db/tenant', () => ({ withTenant: vi.fn() }))
const { requireStudio, studioEntry } = await import('../with-studio')

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
  it('passkeys off for everyone (Admin › Staff): opens with no step-up cookie; the database binds the person alone', async () => {
    s.off = true; s.staffProof = null; s.partnerProof = null
    expect(await requireStudio()).toMatchObject({ ok: true, authSession: 'b1', staffHash: '', partnerHash: '' })
    s.staff = { ok: false }
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

// Studio's entry states (owner 2026-11-23, docs/mockups/2026-11-23-studio-door.html): only a person who is staff AND a
// live partner person, as one user, learns the missing step; for anyone else nothing more is read (no oracle).
describe('studioEntry', () => {
  const staffNeeds = () => ({ ok: false, reason: 'needs_passkey', identity: { kind: 'staff-identity', userId: 'u1', email: 'a@x.in', role: 'support', sessionId: 'b1' } })
  const partnerNeeds = () => ({ ok: false, reason: 'needs_passkey', identity: { kind: 'partner-identity', userId: 'u1', email: 'a@x.in', sessionId: 'b1' } })
  beforeEach(() => { Object.assign(s, structuredClone(base)) })
  it('the same as requireStudio when it opens, or when Studio is off', async () => {
    expect(await studioEntry()).toMatchObject({ ok: true, tenantId: 't1' })
    s.open = 'off'; s.staff = staffNeeds(); s.staffProof = null
    expect(await studioEntry()).toEqual(await requireStudio())
    expect(s.reads).toBe(0)
  })
  it('no oracle: not staff, not a partner, or two people read today\'s answer and nothing else is read', async () => {
    for (const set of [
      () => { s.staff = { ok: false, reason: 'not_staff' }; s.staffProof = null },
      () => { s.partner = { ok: false, reason: 'not_partner' }; s.partnerProof = null },
      () => { s.staff = { ok: false, reason: 'signed_out' } },
      () => { s.partner = { ...s.partner, userId: 'u2' }; s.staffProof = null },
      () => { s.staff = staffNeeds(); s.partner = { ok: false, reason: 'in_review' } },
    ]) {
      Object.assign(s, structuredClone(base)); set()
      const door = await requireStudio()
      s.reads = 0
      expect(await studioEntry()).toEqual(door)
      expect(s.reads).toBe(0)
    }
  })
  it('1b: a check missing names which, staff first; a check on another sign-in counts as missing', async () => {
    s.staff = staffNeeds(); s.staffProof = null; s.partner = partnerNeeds(); s.partnerProof = null
    expect(await studioEntry()).toEqual({ ok: false, reason: 'step', step: { kind: 'check', staff: false, partner: false } })
    Object.assign(s, structuredClone(base)); s.partner = partnerNeeds(); s.partnerProof = null
    expect(await studioEntry()).toEqual({ ok: false, reason: 'step', step: { kind: 'check', staff: true, partner: false } })
    Object.assign(s, structuredClone(base)); s.staffProof = { sessionId: 'old', hash: 'sh' }
    expect(await studioEntry()).toEqual({ ok: false, reason: 'step', step: { kind: 'check', staff: false, partner: true } })
  })
  it('1c: no staff passkey at all', async () => {
    s.staff = staffNeeds(); s.staffProof = null; s.staffPasskeys = 0
    expect(await studioEntry()).toEqual({ ok: false, reason: 'step', step: { kind: 'staff_passkey' } })
  })
  it('1a: both checks made, on another store: the person\'s own partner stores, never a support visit', async () => {
    s.member = { ok: true, userId: 'u1', membership: { tenantId: 't9', tenantName: 'Own shop', role: 'owner', supportSessionId: null } }
    s.memberships = [{ tenantId: 't9', tenantName: 'Own shop', role: 'owner', supportSessionId: null }, { tenantId: 't1', tenantName: 'Kesar', role: 'partner', supportSessionId: null },
      { tenantId: 't7', tenantName: 'Visited', role: 'partner', supportSessionId: 'sv' }]
    expect(await studioEntry()).toEqual({ ok: false, reason: 'step', step: { kind: 'store', stores: [{ tenantId: 't1', name: 'Kesar' }] } })
    s.memberships = [{ tenantId: 't9', tenantName: 'Own shop', role: 'owner', supportSessionId: null }]
    expect(await studioEntry()).toMatchObject({ ok: false, reason: 'no_store' })
  })
  it('passkeys off: no check is asked for; on another store, straight to 1a', async () => {
    s.off = true; s.staffProof = null; s.partnerProof = null
    s.member = { ok: true, userId: 'u1', membership: { tenantId: 't9', tenantName: 'Own shop', role: 'owner', supportSessionId: null } }
    expect(await studioEntry()).toEqual({ ok: false, reason: 'step', step: { kind: 'store', stores: [{ tenantId: 't1', name: 'Kesar' }] } })
  })
})
