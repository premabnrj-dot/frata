// Staff passkeys: the passkey's site answers only on the console host (compared without a port), and "recently
// confirmed" means within 5 minutes.
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ VERCEL_ENV: '', E2E_FIXTURES: false }))
vi.mock('@/lib/public-env', () => ({ CONSOLE_HOST: 'frata.vercel.app', isAuthConfigured: () => true }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: async () => ({}) }))
vi.mock('@/lib/db/platform', () => ({ accessFor: vi.fn() }))

describe('the passkey site', () => {
  it('is the console host only, its origin taken from the request host exactly', async () => {
    const { passkeySite } = await import('../staff-cookie')
    expect(passkeySite('frata.vercel.app')).toEqual({ rpID: 'frata.vercel.app', origin: 'https://frata.vercel.app' })
    expect(passkeySite('FRATA.vercel.app')).toEqual({ rpID: 'frata.vercel.app', origin: 'https://frata.vercel.app' })
    expect(passkeySite('kesar-studio.frrata.shop')).toBeNull()
    expect(passkeySite('frata-git-x-team.vercel.app')).toBeNull()
    expect(passkeySite('evil.test/frata.vercel.app')).toBeNull()
    expect(passkeySite('')).toBeNull()
  })
})

describe('confirmed recently', () => {
  it('is within 5 minutes of the passkey check', async () => {
    const { confirmedRecently } = await import('../require-staff')
    const now = Date.parse('2026-11-12T10:00:00Z')
    const staff = (ms: number) => ({ ok: true as const, userId: 'u', email: 'e', role: 'admin' as const, sessionId: 's', confirmedAt: new Date(now - ms) })
    expect(confirmedRecently(staff(60_000), now)).toBe(true)
    expect(confirmedRecently(staff(4 * 60_000 + 59_000), now)).toBe(true)
    expect(confirmedRecently(staff(5 * 60_000), now)).toBe(false)
    expect(confirmedRecently(staff(60 * 60_000), now)).toBe(false)
  })
})
