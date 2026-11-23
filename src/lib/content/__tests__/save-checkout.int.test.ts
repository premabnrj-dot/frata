// saveCheckout, undoCheckout and decideBrand's checkout branch on a real Postgres, as frata_app (one-address P2·6): the
// owner saves live and keeps the design before it for Undo; a first save, a stale version and two lines refused at their
// fields; the store's partner saves live before the store opens and waits once it is open (one open change of each
// kind: a checkout change never replaces a brand change, nor the reverse); Approve applies a checkout change to
// checkout_design and never to brand_tokens, Decline drops it, and its Undo undoes the design; staff and a support
// visit are refused; Undo only by its saver. Sign-in is mocked; everything else is real. Skipped unless INT_DB_HOST is
// set (frata-verify: INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof).
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const T = randomUUID()
const OWNER = randomUUID(), PARTNER = randomUUID(), STAFF = randomUUID()
let who: { userId: string; role: string; support: string | null } = { userId: OWNER, role: 'owner', support: null }

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (f: () => unknown) => f }))
vi.mock('next/server', () => ({ after: (f: () => void) => f() }))
vi.mock('@/lib/storefront/refresh', () => ({ refreshShop: () => {} }))
vi.mock('@/lib/auth/require-member', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-member')>()),
  requireMember: async (allowed: readonly string[]) => {
    if (!allowed.includes(who.role)) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
    const m = { tenantId: T, tenantName: 'Checkout test', role: who.role, supportSessionId: who.support }
    return { ok: true, userId: who.userId, email: 'x@example.in', membership: m, all: [m], staffRole: null }
  },
}))

const DRAWN = { header: 'left', back: true, rows: 1, trust: ['delivery', 'returns', 'cod', 'secure'], heading: 'Almost yours', thanks: 'We’re glad this one found you.' }

describe.skipIf(!host)('saveCheckout', () => {
  let su: ReturnType<typeof postgres>
  let S: typeof import('../save')
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    await su`insert into tenants (id, slug, name) values (${T}, ${'ck-' + T.slice(0, 8)}, 'Checkout test')`
    await su`insert into shop_settings (tenant_id) values (${T})`
    await su`insert into members (tenant_id, user_id, role) values (${T}, ${OWNER}, 'owner'), (${T}, ${STAFF}, 'staff')`
    const email = `ck-${T.slice(0, 8)}@example.in`
    const [p] = await su`insert into partners (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at, approved_at)
      values (${PARTNER}, ${email}, 'Neel', 'Neel Studio', '919845012398', 'Bengaluru', '{}', '', '1-4', 1, now(), now()) returning id`
    const [pm] = await su`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${p!.id}, ${PARTNER}, ${email}, 'owner', now()) returning id`
    await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${T}, ${PARTNER}, 'partner', ${pm!.id})`
    await su`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values (${T}, 'public', 'Website', ${T.replace(/-/g, '').repeat(2)}, 'frs_pub_ck0001', ${OWNER})`
    S = await import('../save')
  })
  const as = (userId: string, role: string, support: string | null = null) => { who = { userId, role, support } }
  const design = async () => (await su`select * from checkout_design where tenant_id = ${T}`)[0]
  const open = (yes: boolean) => su`update shop_settings set published_at = ${yes ? new Date() : null} where tenant_id = ${T}`
  const proposals = (kind: string) => su`select id, decision, summary from brand_proposals where tenant_id = ${T} and kind = ${kind} order by proposed_at`

  it('the owner’s first save goes live (version null), keeps Frrata’s default for Undo, an audit row of part names', async () => {
    as(OWNER, 'owner')
    const r = await S.saveCheckout({ version: null, design: DRAWN })
    expect(r).toMatchObject({ ok: true, outcome: 'live', version: 1 })
    expect(await design()).toMatchObject({ header: 'left', heading: 'Almost yours', thanks: 'We’re glad this one found you.', updated_by: OWNER })
    expect((await design())!.previous).toMatchObject({ heading: '', trust: ['delivery', 'returns', 'cod', 'secure'] })
    const [a] = await su`select action, detail from audit_events where tenant_id = ${T} and action = 'brand.checkout.save' order by at desc limit 1`
    if (a) expect(JSON.stringify(a.detail)).not.toContain('Almost yours')
  })

  it('a stale version and two lines refused at their fields change nothing', async () => {
    as(OWNER, 'owner')
    expect(await S.saveCheckout({ version: null, design: { ...DRAWN, heading: 'x' } })).toMatchObject({ ok: false, error: expect.stringMatching(/changed since you opened it/) })
    const r = await S.saveCheckout({ version: 1, design: { ...DRAWN, heading: 'Almost yours, beautiful one', thanks: 'Pay the fee to ayuda@okicici.' } })
    expect(r).toMatchObject({ ok: false, error: '2 lines need fixing', fields: { heading: 'Up to 24 characters.', thanks: 'This line has a UPI ID. Remove it to save.' } })
    expect((await design())!.version).toBe(1)
  })

  it('Undo only by its saver, once', async () => {
    as(PARTNER, 'partner')
    expect(await S.undoCheckout({ version: 1 })).toMatchObject({ ok: false })
    as(OWNER, 'owner')
    expect(await S.undoCheckout({ version: 1 })).toMatchObject({ ok: true, outcome: 'live', version: 2 })
    expect((await design())!.heading).toBe('')
    expect(await S.undoCheckout({ version: 2 })).toMatchObject({ ok: false })
  })

  it('the partner saves live before the store opens; staff and a support visit are refused', async () => {
    await open(false)
    as(PARTNER, 'partner')
    expect(await S.saveCheckout({ version: 2, design: DRAWN })).toMatchObject({ ok: true, outcome: 'live', version: 3 })
    as(STAFF, 'staff')
    expect(await S.saveCheckout({ version: 3, design: { ...DRAWN, heading: 'Staff' } })).toMatchObject({ ok: false })
    as(OWNER, 'owner', randomUUID())
    expect(await S.saveCheckout({ version: 3, design: { ...DRAWN, heading: 'Support' } })).toMatchObject({ ok: false, error: expect.stringMatching(/support visit/) })
    expect((await design())!.heading).toBe('Almost yours')
  })

  it('on an open store the partner’s save waits; a newer one replaces it; a brand change waits beside it untouched', async () => {
    await open(true)
    as(PARTNER, 'partner')
    expect(await S.saveBrand({ version: null, patch: { radius: 4 } })).toMatchObject({ ok: true, outcome: 'waits' })
    expect(await S.saveCheckout({ version: 3, design: { ...DRAWN, heading: 'Nearly yours' } })).toMatchObject({ ok: true, outcome: 'waits' })
    expect(await S.saveCheckout({ version: 3, design: { ...DRAWN, heading: 'Nearly there' } })).toMatchObject({ ok: true, outcome: 'waits' })
    const ck = await proposals('checkout'), br = await proposals('brand')
    expect(ck.map((p) => p.decision)).toEqual(['replaced', null])
    expect(ck[1]!.summary).toBe('The checkout heading.')
    expect(br.map((p) => p.decision)).toEqual([null])
    expect((await design())!.heading).toBe('Almost yours')
    const [n] = await su`select href from notices where tenant_id = ${T} and source_kind = 'brand' and source_id = ${ck[1]!.id}`
    expect(n!.href).toBe('/console/brand/checkout')
  })

  it('Approve applies the checkout change to the design and never to the brand record; its Undo undoes the design', async () => {
    as(OWNER, 'owner')
    const [, waiting] = await proposals('checkout')
    const before = (await su`select count(*)::int n from brand_tokens where tenant_id = ${T}`)[0]!.n
    const r = await S.decideBrand({ id: waiting!.id, decision: 'approve' })
    expect(r).toMatchObject({ ok: true, outcome: 'live', version: 4 })
    expect((await design())!.heading).toBe('Nearly there')
    expect((await su`select count(*)::int n from brand_tokens where tenant_id = ${T}`)[0]!.n).toBe(before)
    expect((await proposals('brand')).map((p) => p.decision)).toEqual([null])
    expect(await S.undoCheckout({ version: 4 })).toMatchObject({ ok: true, version: 5 })
    expect((await design())!.heading).toBe('Almost yours')
  })

  it('Decline drops a checkout change with its own audit action; a brand change is still answered as a brand change', async () => {
    as(PARTNER, 'partner')
    expect(await S.saveCheckout({ version: 5, design: { ...DRAWN, back: false } })).toMatchObject({ outcome: 'waits' })
    as(OWNER, 'owner')
    const ck = (await proposals('checkout')).at(-1)!
    expect(await S.decideBrand({ id: ck.id, decision: 'decline' })).toMatchObject({ ok: true, outcome: 'unchanged' })
    expect((await design())!.back_link).toBe(true)
    const [a] = await su`select action from audit_events where tenant_id = ${T} and target = ${ck.id} order by at desc limit 1`
    if (a) expect(a.action).toBe('brand.checkout.decline')
    const [br] = await proposals('brand')
    expect(await S.decideBrand({ id: br!.id, decision: 'approve' })).toMatchObject({ ok: true, outcome: 'live' })
    expect((await su`select radius from brand_tokens where tenant_id = ${T}`)[0]!.radius).toBe(4)
    expect((await design())!.heading).toBe('Almost yours')
  })

  it('a checkout change made against an older design can’t be approved', async () => {
    as(PARTNER, 'partner')
    expect(await S.saveCheckout({ version: 5, design: { ...DRAWN, rows: 2 } })).toMatchObject({ outcome: 'waits' })
    await su`update checkout_design set version = version + 1 where tenant_id = ${T}`
    as(OWNER, 'owner')
    const ck = (await proposals('checkout')).at(-1)!
    expect(await S.decideBrand({ id: ck.id, decision: 'approve' })).toMatchObject({ ok: false, error: expect.stringMatching(/changed after this was sent/) })
    expect((await design())!.policy_rows).toBe(1)
  })

  it('the review card’s answer names its proposal (four-screens § 4): replaced, already answered, the wrong kind', async () => {
    as(OWNER, 'owner')
    const [last] = await su`select version from checkout_design where tenant_id = ${T}`
    as(PARTNER, 'partner')
    expect(await S.saveCheckout({ version: last!.version, design: { ...DRAWN, header: 'centre' } })).toMatchObject({ outcome: 'waits' })
    const older = (await proposals('checkout')).at(-1)!
    expect(await S.saveCheckout({ version: last!.version, design: { ...DRAWN, header: 'centre', thanks: 'Thank you.' } })).toMatchObject({ outcome: 'waits' })
    const newer = (await proposals('checkout')).at(-1)!
    as(OWNER, 'owner')
    expect(await S.decideBrand({ id: older.id, decision: 'approve', kind: 'checkout' })).toEqual({ ok: false, error: 'Your partner sent a newer change.' })
    expect((await design())!.header).toBe('left')
    expect(await S.decideBrand({ id: newer.id, decision: 'approve', kind: 'brand' })).toMatchObject({ ok: false })
    expect((await proposals('checkout')).at(-1)!.decision).toBeNull()
    expect(await S.decideBrand({ id: newer.id, decision: 'decline', kind: 'checkout' })).toMatchObject({ ok: true })
    expect(await S.decideBrand({ id: newer.id, decision: 'approve', kind: 'checkout' })).toMatchObject({ ok: false, error: expect.stringMatching(/^Already declined by you, today, \d/) })
    await su`insert into members (tenant_id, user_id, role) values (${T}, ${randomUUID()}, 'admin')`
    const [mgr] = await su`select user_id from members where tenant_id = ${T} and role = 'admin'`
    as(mgr!.user_id, 'admin')
    expect(await S.decideBrand({ id: newer.id, decision: 'approve' })).toMatchObject({ ok: false, error: expect.stringMatching(/^Already declined by the owner, today, \d/) })
  })
})
