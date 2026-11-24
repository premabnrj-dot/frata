import { beforeEach, describe, expect, it, vi } from 'vitest'

// placeFor (Settings › Store's Pickup PIN code and the Delivery Zones popup, O1·5): only a person who may edit the
// store asks India Post's directory, only for six digits, and a failed read says "unknown", never an error. I/O stubbed.
const state = vi.hoisted(() => ({ ok: true, roles: [] as readonly string[] }))
const lookup = vi.fn()
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async (roles: readonly string[]) => {
    state.roles = roles
    return state.ok ? { ok: true, membership: { tenantId: 't1', role: 'owner', supportSessionId: null } } : { ok: false, message: 'Sign in.' }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }))
vi.mock('@/lib/db/platform', async (orig) => ({ ...(await orig<object>()), placeForPincode: (pin: string) => lookup(pin) }))

describe('placeFor', () => {
  beforeEach(() => { state.ok = true; lookup.mockReset(); lookup.mockResolvedValue({ city: 'Jaipur', state: 'Rajasthan' }) })

  it('asks for a store editor and returns the city and state', async () => {
    const { placeFor } = await import('../actions')
    const { CAN_BUILD } = await import('@/domains/tenancy/roles')
    expect(await placeFor('302003')).toEqual({ city: 'Jaipur', state: 'Rajasthan' })
    expect(state.roles).toEqual(CAN_BUILD)
    expect(lookup).toHaveBeenCalledWith('302003')
  })

  it('refused sign-in: null, and the directory is not read', async () => {
    state.ok = false
    const { placeFor } = await import('../actions')
    expect(await placeFor('302003')).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each(['30200', '3020031', '012345', 'abcdef', 302003 as unknown as string])('not a PIN code (%s): null, not read', async (pin) => {
    const { placeFor } = await import('../actions')
    expect(await placeFor(pin)).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('unknown or a failed read: null', async () => {
    const { placeFor } = await import('../actions')
    lookup.mockResolvedValueOnce(null)
    expect(await placeFor('110001')).toBeNull()
    lookup.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '57014' }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await placeFor('110001')).toBeNull()
  })
})
