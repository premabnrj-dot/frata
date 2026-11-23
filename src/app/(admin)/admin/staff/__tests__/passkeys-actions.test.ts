import { beforeEach, describe, expect, it, vi } from 'vitest'

// Admin › Staff's passkeys switch (docs/plans/2026-11-23-passkeys-off.md; impact review 2026-11-23): only a master admin
// reaches the definer, with this session's step-up cookie (or none); a non-boolean never does; the database's refusal is
// passed on as words. And the state read fails safe: an unreadable switch reads as passkeys ON.
const s = vi.hoisted(() => ({ staff: null as unknown, proof: null as unknown, set: vi.fn(), rows: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/admin/staff-notices', () => ({ sendStaffNotices: vi.fn(async () => 0) }))
vi.mock('@/lib/admin/staff', () => ({ addStaff: vi.fn(), removeStaff: vi.fn() }))
vi.mock('@/lib/db/schema', () => ({ STAFF_ROLES: ['admin', 'support'] }))
vi.mock('@/lib/admin/passkeys', () => ({ setPasskeysOff: (...a: unknown[]) => s.set(...a) }))
vi.mock('@/lib/auth/session', () => ({ staffProof: vi.fn(async () => s.proof) }))
vi.mock('@/lib/auth/require-staff', () => ({ ADMIN_ONLY: ['admin'], confirmedRecently: () => true,
  requireStaff: vi.fn(async (roles: string[]) => { const st = s.staff as { ok: boolean; role?: string }; return st.ok && !roles.includes(st.role!) ? { ok: false, message: 'Only a master admin can do that.' } : st }) }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/index', () => ({ db: () => ({ execute: (...a: unknown[]) => s.rows(...a) }), withFreshPool: vi.fn() }))

const { setPasskeysAction } = await import('../actions')
const admin = { ok: true, userId: 'u1', email: 'a@frrata.in', role: 'admin', sessionId: 'b1', confirmedAt: new Date() }

describe('setPasskeysAction', () => {
  beforeEach(() => { s.set.mockReset(); s.proof = { sessionId: 'b1', hash: 'h' } })
  it('Support staff, or no sign-in, never reach the definer', async () => {
    s.staff = { ...admin, role: 'support' }
    expect(await setPasskeysAction(true)).toEqual({ ok: false, error: 'Only a master admin can do that.' })
    s.staff = { ok: false, message: 'Sign in again.' }
    expect(await setPasskeysAction(false)).toEqual({ ok: false, error: 'Sign in again.' })
    expect(s.set).not.toHaveBeenCalled()
  })
  it('a value that is not true or false never reaches the definer', async () => {
    s.staff = admin
    expect(await setPasskeysAction('yes' as unknown as boolean)).toEqual({ ok: false, error: 'Passkeys stay as they were. Try again.' })
    expect(s.set).not.toHaveBeenCalled()
  })
  it('a master admin: this session\'s cookie (or none) goes to the definer; its refusal comes back as words', async () => {
    s.staff = admin
    s.set.mockResolvedValue({ ok: true, value: true })
    expect(await setPasskeysAction(true)).toEqual({ ok: true })
    expect(s.set).toHaveBeenCalledWith(admin, { sessionId: 'b1', hash: 'h' }, true)
    s.proof = null
    s.set.mockResolvedValue({ ok: false, error: 'Confirm with your passkey first.' })
    expect(await setPasskeysAction(true)).toEqual({ ok: false, error: 'Confirm with your passkey first.' })
    expect(s.set).toHaveBeenLastCalledWith(admin, null, true)
  })
})

describe('passkeysState', () => {
  it('reads the switch; an error reads as passkeys on', async () => {
    const { passkeysState } = await import('@/lib/db/platform')
    s.rows.mockResolvedValueOnce([{ s: { off: true, since: '2026-11-23T10:00:00Z', by: 'a@frrata.in' } }])
    expect(await passkeysState()).toEqual({ off: true, since: '2026-11-23T10:00:00Z', by: 'a@frrata.in' })
    s.rows.mockRejectedValueOnce(new Error('down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await passkeysState()).toEqual({ off: false, since: null, by: null })
    err.mockRestore()
  })
})
