// "Open Studio" posts to switchStoreAction with to=/partner/studio (2026-11-24). The store is chosen only among the
// person's own stores (never trusted from the form), and the destination only from the allow-list.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const T1 = '11111111-1111-4111-8111-111111111111', T2 = '22222222-2222-4222-8222-222222222222'
const jar = { set: vi.fn() }
const st = { all: [{ tenantId: T1, supportSessionId: null }], builds: [] as { tenantId: string }[] }
vi.mock('next/headers', () => ({ cookies: async () => jar }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`) } }))
vi.mock('@/lib/auth/require-member', () => ({ TENANT_COOKIE: 'tenant', currentStore: async () => ({ kind: 'builder', all: st.all, builds: st.builds }) }))
const { switchStoreAction } = await import('../../../app/choose/actions')

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }
const go = async (f: FormData) => { try { await switchStoreAction(f); return 'none' } catch (e) { return (e as Error).message } }

describe('Open Studio through switchStoreAction', () => {
  beforeEach(() => { jar.set.mockClear(); st.all = [{ tenantId: T1, supportSessionId: null }]; st.builds = [] })
  it('lands on /partner/studio for the person’s own store, and sets that store only', async () => {
    expect(await go(form({ tenantId: T1, to: '/partner/studio' }))).toBe('REDIRECT /partner/studio')
    expect(jar.set).toHaveBeenCalledWith('tenant', T1, expect.anything())
  })
  it('a store that is not theirs switches nothing and lands on the console', async () => {
    expect(await go(form({ tenantId: T2, to: '/partner/studio' }))).toBe('REDIRECT /console')
    expect(jar.set).not.toHaveBeenCalled()
  })
  it('a support visit is never a store to open', async () => {
    st.all = [{ tenantId: T1, supportSessionId: 'v1' } as never]
    expect(await go(form({ tenantId: T1, to: '/partner/studio' }))).toBe('REDIRECT /console')
    expect(jar.set).not.toHaveBeenCalled()
  })
  it('a destination outside the list is ignored', async () => {
    expect(await go(form({ tenantId: T1, to: 'https://evil.example' }))).toBe('REDIRECT /console')
  })
})
