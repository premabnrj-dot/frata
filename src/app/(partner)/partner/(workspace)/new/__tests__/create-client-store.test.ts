import { beforeEach, describe, expect, it, vi } from 'vitest'

// createClientStoreAction with its I/O stubbed: the web address is capped at 30 in the schema (security review of O1,
// 2026-11-24), so an oversized one never reaches the limiter or the definer.
const createClientStore = vi.fn()
const limited = vi.fn(async () => true)
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn() }) }))
vi.mock('@/lib/auth/require-member', () => ({ TENANT_COOKIE: 'frata_tenant' }))
vi.mock('@/lib/auth/require-partner', () => ({ requirePartner: async () => ({ ok: true, partner: { memberRole: 'owner' } }) }))
vi.mock('@/lib/db/partners', () => ({ createClientStore: (...a: unknown[]) => createClientStore(...a) }))
vi.mock('@/lib/db/rate-limit', () => ({ LIMITS: {}, withinLimit: () => limited() }))
vi.mock('@/lib/http/client-ip', () => ({ clientIp: async () => '1.2.3.4' }))
vi.mock('@/lib/queries/storefront', () => ({ hostFor: (s: string) => s, refreshHosts: () => undefined }))

describe('createClientStoreAction', () => {
  beforeEach(() => { createClientStore.mockReset(); createClientStore.mockResolvedValue({ ok: true, tenantId: 't1' }); limited.mockClear() })

  it.each([31, 100_000])('a web address of %i characters is refused by the schema', async (n) => {
    const { createClientStoreAction } = await import('../actions')
    expect(await createClientStoreAction({ name: 'Noor', slug: 'a'.repeat(n) })).toEqual({ ok: false, error: 'Check the highlighted fields.' })
    expect(limited).not.toHaveBeenCalled()
    expect(createClientStore).not.toHaveBeenCalled()
  })

  it('30 characters goes through', async () => {
    const { createClientStoreAction } = await import('../actions')
    expect(await createClientStoreAction({ name: 'Noor', slug: 'a'.repeat(30) })).toEqual({ ok: true })
    expect(createClientStore).toHaveBeenCalledOnce()
  })
})
