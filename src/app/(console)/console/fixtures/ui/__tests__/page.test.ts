// The test-only primitives page must be a 404 unless the e2e stack turns it on — checked before anything else
// runs (no sign-in lookup, no render). Production never sets E2E_FIXTURES (.env.example).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
const requireMember = vi.fn(async () => ({ ok: true }))
const env = { E2E_FIXTURES: false }
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/auth/require-member', () => ({ ANY_MEMBER: ['owner', 'admin', 'staff'], requireMember }))
vi.mock('@/lib/env', () => env)
vi.mock('../primitives', () => ({ Primitives: () => null }))

describe('the fixtures page', () => {
  beforeEach(() => { notFound.mockClear(); requireMember.mockClear(); vi.resetModules() })
  it('is a 404 with the switch off, before any sign-in lookup', async () => {
    env.E2E_FIXTURES = false
    const page = (await import('../page')).default
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requireMember).not.toHaveBeenCalled()
  })
  it('with the switch on, still needs a member', async () => {
    env.E2E_FIXTURES = true
    requireMember.mockResolvedValueOnce({ ok: false } as never)
    const page = (await import('../page')).default
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requireMember).toHaveBeenCalledOnce()
  })
})
