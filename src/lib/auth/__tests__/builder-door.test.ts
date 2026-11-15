// T1c (ADR-0015): a Builder's store never reaches requireMember, asMember or any tuple; requireCapability gives a
// Builder an Actor only for the capabilities its role holds; the cookie never falls through to another store.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <F extends (...a: never[]) => unknown>(f: F) => { const hits = new Map<string, unknown>(); return ((...a: never[]) => { const k = JSON.stringify(a); if (!hits.has(k)) hits.set(k, f(...a)); return hits.get(k) }) as F } }))
let cookie: string | undefined
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (cookie ? { value: cookie } : undefined) }) }))
vi.mock('@/lib/public-env', () => ({ isAuthConfigured: () => true, CONSOLE_HOST: 'localhost:3077' }))
vi.mock('@/lib/env', () => ({ isDatabaseConfigured: () => true, isAdminDatabaseConfigured: () => true, isBuilderDatabaseConfigured: () => false, DATABASE_URL_BUILDER: '', VERCEL_ENV: '', E2E_FIXTURES: false }))
const getUser = vi.fn(async () => ({ data: { user: { id: 'u1', email: 'meera@pixelthread.in' } } }))
const getClaims = vi.fn(async () => ({ data: { claims: {} } }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: async () => ({ auth: { getUser, getClaims } }) }))
const accessFor = vi.fn()
vi.mock('@/lib/db/platform', () => ({ accessFor }))
vi.mock('@/lib/db/tenant', () => ({ withTenant: vi.fn(async () => { throw new Error('a Builder reached withTenant') }) }))

const TUPLES = ['ANY_MEMBER', 'CAN_BUILD', 'SHIPPERS', 'CONSOLE_ROLES', 'CAN_SEE_GST', 'CAN_INVITE_ACCOUNTANT', 'CAN_MANAGE', 'CAN_SET_COSTS'] as const
const builderOnly = { memberships: [], builds: [{ tenantId: 't-amber', tenantName: 'Amber' }], staffRole: null }

beforeEach(() => { vi.resetModules(); accessFor.mockReset(); cookie = undefined })

describe('a Builder and requireMember', () => {
  it('every tuple refuses a Builder, in words, and nothing is read', async () => {
    accessFor.mockResolvedValue(builderOnly)
    const roles = await import('@/domains/tenancy/roles')
    const { requireMember } = await import('../require-member')
    for (const t of TUPLES) expect(await requireMember(roles[t])).toMatchObject({ ok: false, reason: 'builder', message: 'Builders can’t see this page.' })
  })
  it('asMember refuses a Builder before any transaction', async () => {
    accessFor.mockResolvedValue(builderOnly)
    const { asMember } = await import('../as-member')
    const { ANY_MEMBER } = await import('@/domains/tenancy/roles')
    const work = vi.fn()
    expect(await asMember(ANY_MEMBER, { action: 'x' }, work)).toEqual({ ok: false, error: 'Builders can’t see this page.' })
    expect(work).not.toHaveBeenCalled()
  })
  it('a person who owns B and builds A: the cookie on A refuses, never falls through to B', async () => {
    accessFor.mockResolvedValue({ memberships: [{ tenantId: 't-basil', tenantName: 'Basil', role: 'owner', supportSessionId: null }], builds: [{ tenantId: 't-amber', tenantName: 'Amber' }], staffRole: null })
    cookie = 't-amber'
    const { requireMember, ANY_MEMBER } = await import('../require-member')
    expect(await requireMember(ANY_MEMBER)).toMatchObject({ ok: false, reason: 'builder' })
  })
  it('the same person with the cookie on B is the owner of B', async () => {
    accessFor.mockResolvedValue({ memberships: [{ tenantId: 't-basil', tenantName: 'Basil', role: 'owner', supportSessionId: null }], builds: [{ tenantId: 't-amber', tenantName: 'Amber' }], staffRole: null })
    cookie = 't-basil'
    const { requireMember, ANY_MEMBER } = await import('../require-member')
    expect(await requireMember(ANY_MEMBER)).toMatchObject({ ok: true, membership: { tenantId: 't-basil' } })
  })
})

describe('requireCapability', () => {
  it('gives a Builder an Actor for catalogue.read, console.open and preview.read only', async () => {
    accessFor.mockResolvedValue(builderOnly)
    const { requireCapability } = await import('../require-capability')
    for (const cap of ['catalogue.read', 'console.open', 'preview.read'] as const) {
      const r = await requireCapability(cap)
      expect(r).toMatchObject({ ok: true, kind: 'builder', store: { tenantId: 't-amber' } })
      if (r.ok && r.kind === 'builder') expect(Object.keys(r.actor)).toEqual(['kind', 'role'])
    }
    for (const cap of ['shop.work', 'shop.build', 'shop.manage', 'costs.set', 'console.full', 'api.manage', 'content.write'] as const) {
      expect(await requireCapability(cap)).toMatchObject({ ok: false, reason: 'builder' })
    }
  })
  it('a member keeps today\'s answer', async () => {
    accessFor.mockResolvedValue({ memberships: [{ tenantId: 't1', tenantName: 'Kesar', role: 'staff', supportSessionId: null }], builds: [], staffRole: null })
    const { requireCapability } = await import('../require-capability')
    expect(await requireCapability('catalogue.read')).toMatchObject({ ok: true, kind: 'member', auth: { membership: { role: 'staff' } } })
    expect(await requireCapability('shop.manage')).toMatchObject({ ok: false, reason: 'no_access' })
  })
  it('the Builder database refuses when its login is not set (fail closed, owner question 7)', async () => {
    accessFor.mockResolvedValue(builderOnly)
    const { requireCapability } = await import('../require-capability')
    const { withActor, previewTenantOf, assertCan } = await import('@/lib/db/actor')
    const r = await requireCapability('catalogue.read')
    if (!r.ok || r.kind !== 'builder') throw new Error('no actor')
    await expect(withActor(r.actor, 'catalogue.read', async () => 1)).rejects.toThrow('DATABASE_URL_BUILDER is not set')
    await expect(withActor(r.actor, 'shop.work', async () => 1)).rejects.toThrow('refused: shop.work')
    expect(previewTenantOf(r.actor)).toBe('t-amber')
    expect(() => assertCan({ kind: 'builder', role: 'builder' }, 'catalogue.read')).toThrow('refused')
  })
})
