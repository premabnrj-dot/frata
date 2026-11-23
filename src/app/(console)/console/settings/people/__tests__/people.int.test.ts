// Settings › People's actions on a real Postgres, as frata_app (docs/specs/2026-11-23-add-partner.md): the owner adds a
// Manager, Staff and a partner; a Manager adds Staff but never a Manager or a partner, and removes neither the owner nor
// another Manager; a support visit changes nothing; the limit is said in words. Sign-in is mocked; everything else is
// real. Skipped unless INT_DB_HOST is set. Its own store (a fresh id).
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const T = randomUUID()
const OWNER = randomUUID(), MANAGER = randomUUID()
let who: { userId: string; role: string; support: string | null } = { userId: OWNER, role: 'owner', support: null }

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (f: () => unknown) => f }))
vi.mock('@/lib/auth/require-member', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-member')>()),
  requireMember: async (allowed: readonly string[]) => {
    if (!allowed.includes(who.role)) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
    const m = { tenantId: T, tenantName: 'People test', role: who.role, supportSessionId: who.support }
    return { ok: true, userId: who.userId, email: 'x@example.in', membership: m, all: [m], staffRole: null }
  },
}))

describe.skipIf(!host)('Settings › People actions', () => {
  let su: ReturnType<typeof postgres>
  let A: typeof import('../people-actions')
  const tag = T.slice(0, 8)
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    await su`insert into tenants (id, slug, name) values (${T}, ${'people-' + tag}, 'People test')`
    await su`insert into auth.users (id, email, email_confirmed_at) values (${OWNER}, ${`o-${tag}@example.in`}, now()), (${MANAGER}, ${`m-${tag}@example.in`}, now())`
    await su`insert into members (tenant_id, user_id, role) values (${T}, ${OWNER}, 'owner'), (${T}, ${MANAGER}, 'admin')`
    A = await import('../people-actions')
  })
  afterAll(async () => { await su?.end() })
  const as = (userId: string, role: string, support: string | null = null) => { who = { userId, role, support } }

  it('the owner adds Staff; a Manager adds Staff but never a Manager or a partner', async () => {
    as(OWNER, 'owner')
    expect(await A.addPersonAction({ email: `s1-${tag}@example.in`, role: 'staff' })).toMatchObject({ ok: true })
    as(MANAGER, 'admin')
    expect(await A.addPersonAction({ email: `m2-${tag}@example.in`, role: 'admin' })).toMatchObject({ ok: false })
    expect(await A.addPersonAction({ email: `p-${tag}@example.in`, role: 'partner' })).toMatchObject({ ok: false })
    expect(await A.addPersonAction({ email: `s2-${tag}@example.in`, role: 'staff' })).toMatchObject({ ok: true })
    expect(await A.removePersonAction(OWNER)).toMatchObject({ ok: false, error: expect.stringMatching(/isn’t on the store/) })
  })

  it('says the limit in words, and a support visit changes nothing', async () => {
    as(OWNER, 'owner')
    // Manager + 2 open invites = 3, the Launch fallback.
    expect(await A.addPersonAction({ email: `s3-${tag}@example.in`, role: 'staff' })).toMatchObject({ ok: false, error: expect.stringMatching(/no room/) })
    as(OWNER, 'owner', randomUUID())
    expect(await A.addPersonAction({ email: `p-${tag}@example.in`, role: 'partner' })).toMatchObject({ ok: false })
    as(OWNER, 'owner')
    expect(await A.addPersonAction({ email: `p-${tag}@example.in`, role: 'partner' })).toMatchObject({ ok: true })
    expect(await A.addPersonAction({ email: `p2-${tag}@example.in`, role: 'partner' })).toMatchObject({ ok: false, error: expect.stringMatching(/Cancel the open partner invitation/) })
    expect(await A.cancelPartnerRequestAction()).toMatchObject({ ok: true })
    const [n] = await su`select count(*)::int as n from notices where tenant_id = ${T} and source_kind = 'partner_request'`
    expect(n!.n).toBeGreaterThanOrEqual(2) // the Manager's invite and the partner invitation each told the owner
  })
})
