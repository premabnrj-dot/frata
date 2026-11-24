import { beforeEach, describe, expect, it, vi } from 'vitest'

// createMyShop with its I/O stubbed: what reaches the definer is pinned, never the network.
const createShop = vi.fn()
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ ok: true, userId: 'u1', email: 'a@b.test' }) }))
vi.mock('@/lib/db/platform', () => ({ createShop: (p: unknown) => createShop(p), slugAvailable: vi.fn(), placeForPincode: vi.fn() }))
vi.mock('@/lib/db/rate-limit', () => ({ LIMITS: {}, withinLimit: async () => true }))
vi.mock('@/lib/http/client-ip', () => ({ clientIp: async () => '1.2.3.4' }))
vi.mock('@/lib/queries/settings', () => ({ setStartingHsn: async () => undefined }))
vi.mock('@/lib/queries/storefront', () => ({ hostFor: (s: string) => s, refreshHosts: () => undefined }))
vi.mock('@/lib/trials/claims', () => ({ claimKey: () => null }))
vi.mock('@/lib/trials/signup-code', () => ({ signupCodeOn: () => false, checkCode: vi.fn(), sendCode: vi.fn() }))

const base = { name: 'Noor Threads', slug: 'noor-threads', sells: [], plan: 'growth' }

describe('createMyShop', () => {
  beforeEach(() => { createShop.mockReset(); createShop.mockResolvedValue({ ok: true, tenantId: 't1', trial: true }) })

  it('sends no pickup PIN code and passes the sign-up time', async () => {
    const { createMyShop } = await import('../actions')
    expect(await createMyShop({ ...base, signupMs: 41_500 })).toEqual({ ok: true, trial: true })
    const sent = createShop.mock.calls[0]![0]
    expect(sent).not.toHaveProperty('pickup')
    expect(sent.signupMs).toBe(41_500)
  })

  it.each([-5, 'x', 1e12, 1.5, undefined, null])('a bad time (%s) becomes null and never blocks the sign-up', async (bad) => {
    const { createMyShop } = await import('../actions')
    expect((await createMyShop({ ...base, signupMs: bad })).ok).toBe(true)
    expect(createShop.mock.calls[0]![0].signupMs).toBeNull()
  })

  it('a refusal carries its code, said in store words', async () => {
    createShop.mockResolvedValue({ ok: false, error: 'slug_taken' })
    const { createMyShop } = await import('../actions')
    const r = await createMyShop(base)
    expect(r).toMatchObject({ ok: false, code: 'slug_taken', field: 'slug', error: 'Someone just took that address. Try another.' })
    createShop.mockResolvedValue({ ok: false, error: 'unknown' })
    expect(await createMyShop(base)).toMatchObject({ ok: false, error: 'We could not create your store. Nothing was saved.' })
  })

  it.each([31, 100_000])('a web address of %i characters is refused by the schema, before any check or write', async (n) => {
    const { createMyShop } = await import('../actions')
    expect(await createMyShop({ ...base, slug: 'a'.repeat(n) })).toEqual({ ok: false, error: 'Check the highlighted fields.' })
    expect(createShop).not.toHaveBeenCalled()
    expect((await createMyShop({ ...base, slug: 'a'.repeat(30) })).ok).toBe(true)
  })
})
