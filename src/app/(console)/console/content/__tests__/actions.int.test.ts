// Console › Content's actions on a real Postgres, as frata_app (V1 content; impact review 2026-11-15): who may save
// (the owner, a Manager and the store's partner, before and after handover; staff and a support visit refused, and
// refused saves give the limit back; a partner's save tells the owner in the Inbox, once per place an hour), a stale version refused with who saved it as a role, Undo only by its saver within a minute (a
// deleted bar back only while there's room), editing an ended bar keeps it ended, a page shown only once its words are
// its own and its address never moves, the FAQ made with its first question. Sign-in is mocked; everything else is
// real. Skipped unless INT_DB_HOST is set. It uses a store of its own (a fresh id) and leaves it.
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const T = randomUUID()
const OWNER = randomUUID(), ADMIN = randomUUID(), PARTNER = randomUUID()
let who: { userId: string; role: string; support: string | null } = { userId: OWNER, role: 'owner', support: null }

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (f: () => unknown) => f }))
vi.mock('next/server', () => ({ after: (f: () => void) => f() }))
vi.mock('@/lib/storefront/refresh', () => ({ refreshContent: async () => 'now', refreshShop: () => {} }))
vi.mock('@/lib/auth/require-member', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-member')>()),
  requireMember: async (allowed: readonly string[]) => {
    if (!allowed.includes(who.role)) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
    const m = { tenantId: T, tenantName: 'Content test', role: who.role, supportSessionId: who.support }
    return { ok: true, userId: who.userId, email: 'x@example.in', membership: m, all: [m], staffRole: null }
  },
}))

describe.skipIf(!host)('Console › Content actions', () => {
  let su: ReturnType<typeof postgres>
  let A: typeof import('../actions')
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    su = postgres(process.env.INT_DB_SUPER_URL ?? process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    await su`insert into tenants (id, slug, name) values (${T}, ${'content-' + T.slice(0, 8)}, 'Content test')`
    await su`insert into members (tenant_id, user_id, role) values (${T}, ${OWNER}, 'owner'), (${T}, ${ADMIN}, 'admin')`
    const email = `p-${T.slice(0, 8)}@example.in`
    const [p] = await su`insert into partners (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at, approved_at)
      values (${PARTNER}, ${email}, 'Pia', 'Pia Studio', '919845012345', 'Jaipur', '{}', '', '1-4', 1, now(), now()) returning id`
    const [pm] = await su`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${p!.id}, ${PARTNER}, ${email}, 'owner', now()) returning id`
    await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${T}, ${PARTNER}, 'partner', ${pm!.id})`
    A = await import('../actions')
  })
  const as = (userId: string, role: string, support: string | null = null) => { who = { userId, role, support } }
  const row = async (kind: string) => (await su`select * from site_content where tenant_id = ${T} and kind = ${kind} and deleted_at is null order by created_at`)
  const limit = async () => Number((await su`select coalesce(sum(n), 0)::int n from rate_limits where key = encode(sha256(convert_to(${'content_save:shop:' + T}, 'UTF8')), 'hex')`)[0]!.n)

  it('who may save: owner and Manager yes; staff and a support visit no, and nothing counts', async () => {
    as(OWNER, 'owner')
    const r = await A.saveContactAction({ version: null, line: 'We reply within the day.' })
    expect(r).toMatchObject({ ok: true, version: 1 })
    const used = await limit()
    as(randomUUID(), 'staff')
    expect((await A.saveContactAction({ version: 1, line: 'Staff' })).ok).toBe(false)
    as(OWNER, 'owner', randomUUID())
    expect((await A.saveContactAction({ version: 1, line: 'Support' })).ok).toBe(false) // a fake visit id: the support audit row's key refuses too; who.ts holds the words
    expect(await limit()).toBe(used) // refused saves gave their count back
    expect((await row('contact'))[0]!.value).toEqual({ line: 'We reply within the day.' })
    const [a] = await su`select actor_kind, action, detail from audit_events where tenant_id = ${T} order by at desc limit 1`
    expect(a).toMatchObject({ actor_kind: 'member', action: 'content.add' })
    expect(JSON.stringify(a!.detail)).not.toMatch(/We reply/) // field names only, never the words
  })

  it('the partner saves after handover; the store is told in Notices once per partner an hour, never the saver; the owner\'s save tells no one', async () => {
    const told = async () => (await su`select title, href, type from notices where tenant_id = ${T} and source_kind = 'content' and source_id is not null order by created_at`)
    as(PARTNER, 'partner')
    const m = await A.saveMenuAction({ key: 'main', version: null, items: [{ id: 'a', label: 'Sarees', link: '/products', icon: null, children: [] }] })
    if (!m.ok) throw new Error(m.error)
    expect(await told()).toEqual([{ title: 'Your partner added the main menu', href: '/console/content?tab=menus', type: 'needs_you' }])
    expect((await A.saveMenuAction({ key: 'main', version: m.version, items: [] })).ok).toBe(true)
    expect((await A.saveFaqAction({ id: null, version: null, items: [{ q: 'Do you ship abroad?', a: 'Not yet.' }] })).ok).toBe(true)
    expect(await told()).toHaveLength(1) // one line per partner an hour, whatever they touch
    // An hour on: the FAQ's own words, on its own tab.
    await su`update notices set created_at = now() - interval '61 minutes' where tenant_id = ${T} and source_kind = 'content'`
    const [faq] = await su`select id, version from shop_pages where tenant_id = ${T} and template = 'faq'`
    expect((await A.saveFaqAction({ id: faq!.id, version: faq!.version, items: [{ q: 'Do you ship abroad?', a: 'From January.' }] })).ok).toBe(true)
    expect((await told()).at(-1)).toEqual({ title: 'Your partner changed the FAQ', href: '/console/content?tab=faq', type: 'needs_you' })
    as(OWNER, 'owner')
    expect((await A.saveMenuAction({ key: 'main', version: m.version + 1, items: [] })).ok).toBe(true)
    expect(await told()).toHaveLength(2)
    const bodies = await su`select title, body from notices where tenant_id = ${T} and source_kind = 'content' and source_id is not null`
    expect(JSON.stringify(bodies)).not.toMatch(/Sarees|abroad|January/) // the place, never the words
    // The saver isn't shown their own line; the owner is.
    const { listNotices } = await import('@/lib/queries/notices')
    expect((await listNotices(T, PARTNER, 'partner', 'Content test')).filter((n) => /Your partner/.test(n.title))).toHaveLength(0)
    expect((await listNotices(T, OWNER, 'owner', 'Content test')).filter((n) => /Your partner/.test(n.title))).toHaveLength(2)
    await su`delete from shop_pages where tenant_id = ${T} and template = 'faq'` // the pages test makes its own FAQ
  })

  it('a stale save is refused, naming who saved as a role; nothing changes', async () => {
    as(ADMIN, 'admin')
    expect((await A.saveContactAction({ version: 1, line: 'Manager line' })).ok).toBe(true)
    as(OWNER, 'owner')
    const r = await A.saveContactAction({ version: 1, line: 'Stale' })
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/^The manager changed this .*Reload to see it\.$/) })
    expect((await row('contact'))[0]!.value).toEqual({ line: 'Manager line' })
  })

  it('Undo: its saver only, once, within a minute', async () => {
    as(OWNER, 'owner')
    const s = await A.saveMenuAction({ key: 'footer', version: null, items: [{ id: 'a', label: 'Returns', link: '/policies/returns', icon: null, children: [] }] })
    expect(s.ok).toBe(true)
    const s2 = await A.saveMenuAction({ key: 'footer', version: 1, items: [] })
    if (!s2.ok) throw new Error(s2.error)
    as(ADMIN, 'admin')
    expect((await A.undoContentAction({ id: s2.id, version: s2.version })).ok).toBe(false)
    as(OWNER, 'owner')
    expect((await A.undoContentAction({ id: s2.id, version: s2.version })).ok).toBe(true)
    expect((await row('menu')).find((x) => x.key === 'footer')!.value).toEqual([{ id: 'a', label: 'Returns', link: '/policies/returns', icon: null, children: [] }])
    expect((await A.undoContentAction({ id: s2.id, version: s2.version + 1 })).ok).toBe(false) // previous is spent
    await su`update site_content set updated_at = now() - interval '2 minutes', previous = '{"value":[]}' where tenant_id = ${T} and kind = 'menu' and key = 'footer'`
    const m = (await row('menu')).find((x) => x.key === 'footer')
    expect((await A.undoContentAction({ id: m!.id, version: m!.version })).ok).toBe(false) // too late
  })

  it('bars: three at most; an end before its start refused; editing an ended bar keeps it ended; a deleted one comes back only with room', async () => {
    as(OWNER, 'owner')
    const add = (text: string) => A.saveBarAction({ id: null, version: null, text, link: null, scheme: 'paper', startsAt: null, endsAt: null })
    expect(await A.saveBarAction({ id: null, version: null, text: 'x', link: null, scheme: 'paper', startsAt: '2026-12-02T10:00:00+05:30', endsAt: '2026-12-01T10:00:00+05:30' })).toMatchObject({ ok: false, field: 'endsAt' })
    expect(await A.saveBarAction({ id: null, version: null, text: 'x', link: 'https://evil.example', scheme: 'paper', startsAt: null, endsAt: null })).toMatchObject({ ok: false, field: 'link' })
    const b1 = await add('One'), b2 = await add('Two'), b3 = await add('Three')
    if (!b1.ok || !b2.ok || !b3.ok) throw new Error('bars')
    expect((await add('Four')).ok).toBe(false)
    const ended = await A.endBarAction({ id: b1.id, version: b1.version })
    if (!ended.ok) throw new Error(ended.error)
    const edited = await A.saveBarAction({ id: b1.id, version: ended.version, text: 'One, edited', link: '/products', scheme: 'ink', startsAt: null, endsAt: null })
    expect(edited.ok).toBe(true)
    expect((await row('announcement')).find((r) => r.id === b1.id)!.stopped_at).not.toBeNull()
    const gone = await A.deleteBarAction({ id: b2.id, version: b2.version })
    if (!gone.ok) throw new Error(gone.error)
    const b4 = await add('Four')
    expect(b4.ok).toBe(true)
    expect(await A.undoContentAction({ id: b2.id, version: gone.version })).toMatchObject({ ok: false, error: expect.stringMatching(/3 of 3 bars/) })
  })

  it('pages: added hidden; shown only once its words are its own; the address never moves; the FAQ is made with its first question', async () => {
    as(OWNER, 'owner')
    const p = await A.addPageAction({ title: 'Our story', handle: 'our-story' })
    if (!p.ok) throw new Error(p.error)
    const [pg] = await su`select draft, live from shop_pages where tenant_id = ${T} and id = ${p.id}`
    expect(pg!.live).toBeNull()
    const draft = { ...(pg!.draft as object), hidden: false }
    expect((await A.savePageAction({ id: p.id, version: p.version, draft })).ok).toBe(false) // the example words still stand
    const own = { ...draft, handle: 'moved', fill: { story: { kind: 'text', body: [[{ text: 'Two looms in 2019.' }]] }, 'makers-heading': { kind: 'heading', text: 'How we make it' },
      ...Object.fromEntries([1, 2, 3].flatMap((n) => [[`maker-heading-${n}`, { kind: 'heading', text: `Step ${n}` }], [`maker-words-${n}`, { kind: 'text', body: [[{ text: `Words ${n}` }]] }]])) } }
    const spoofed = { ...own, fill: { ...own.fill, 'makers-heading': { kind: 'heading', text: 'How we\u202Emake it' } } }
    expect((await A.savePageAction({ id: p.id, version: p.version, draft: spoofed })).ok).toBe(false) // a hidden character in a heading
    const saved = await A.savePageAction({ id: p.id, version: p.version, draft: own })
    expect(saved.ok).toBe(true)
    const [shown] = await su`select draft->>'handle' as handle, live from shop_pages where tenant_id = ${T} and id = ${p.id}`
    expect(shown!.handle).toBe('our-story')
    expect(shown!.live).not.toBeNull()
    const f = await A.saveFaqAction({ id: null, version: null, items: [{ q: 'Can I pay on delivery?', bound: 'cod' }] })
    expect(f.ok).toBe(true)
    expect((await A.saveFaqAction({ id: null, version: null, items: [] })).ok).toBe(false) // one FAQ a store
  })
})
