// oncePerCall (src/lib/auth/session.ts): inside one call each sign-in check runs once; outside a call, and in another
// call, it runs afresh (speed review of the Studio phase, MED-4; impact review: the memo wraps the auth door).
import { describe, expect, it, vi } from 'vitest'

const n = { getUser: 0, access: 0 }
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: async () => ({ auth: {
    getUser: async () => { n.getUser++; return { data: { user: { id: '11111111-1111-1111-1111-111111111111' } } } },
    getClaims: async () => ({ data: null }),
  } }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/db/platform', () => ({ accessFor: vi.fn(async () => { n.access++; return { memberships: [] } }) }))
const { accessOf, oncePerCall, signedInUser } = await import('../session')

describe('oncePerCall', () => {
  it('inside a call: one Supabase check and one access query, however many ask', async () => {
    n.getUser = 0; n.access = 0
    await oncePerCall(async () => {
      await Promise.all([signedInUser(), signedInUser(), accessOf('u1'), accessOf('u1')])
      await signedInUser()
    })
    expect(n).toEqual({ getUser: 1, access: 1 })
  })
  it('a different argument is its own lookup', async () => {
    n.access = 0
    await oncePerCall(async () => { await accessOf('u1'); await accessOf('u2') })
    expect(n.access).toBe(2)
  })
  it('outside a call, and in a second call, each ask is its own lookup (nothing outlives a call)', async () => {
    n.getUser = 0
    await signedInUser(); await signedInUser()
    expect(n.getUser).toBe(2)
    await oncePerCall(() => signedInUser()); await oncePerCall(() => signedInUser())
    expect(n.getUser).toBe(4)
  })
})
