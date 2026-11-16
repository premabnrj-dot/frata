// saveBrand, decideBrand and undoBrand on a real Postgres, as frata_app (one-address P1·3): the owner's save goes live
// and keeps the record before it for Undo; a theme shop saves its logo only; the partner's save goes live before the
// store opens and waits for the owner once it is open (one Notices line, the owner and Managers only, the live record
// unchanged, a newer save replacing the waiting one); Approve puts it live, Decline drops it, a change answered stays
// answered; a stale version, a colour below contrast, a logo outside the store's folder, staff and a support visit are
// refused and the limit is given back; Undo only by its saver. Sign-in and the media store are mocked; everything else
// is real. Skipped unless INT_DB_HOST is set (frata-verify: INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof).
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const T = randomUUID(), THEME = randomUUID()
const OWNER = randomUUID(), ADMIN = randomUUID(), PARTNER = randomUUID(), STAFF = randomUUID()
let who: { userId: string; role: string; support: string | null; t: string } = { userId: OWNER, role: 'owner', support: null, t: T }

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (f: () => unknown) => f }))
vi.mock('next/server', () => ({ after: (f: () => void) => f() }))
vi.mock('@/lib/storefront/refresh', () => ({ refreshShop: () => {} }))
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<typeof import('@/lib/env')>()), BLOB_STORE_ID: 'store_brandtest' }))
vi.mock('@/lib/media/uploaded', () => ({ photosAreMade: async () => true }))
vi.mock('@/lib/media/brand-files', () => ({ svgIsStored: async () => true, afterMainLogo: () => {} }))
vi.mock('@/lib/auth/require-member', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-member')>()),
  requireMember: async (allowed: readonly string[]) => {
    if (!allowed.includes(who.role)) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
    const m = { tenantId: who.t, tenantName: 'Brand test', role: who.role, supportSessionId: who.support }
    return { ok: true, userId: who.userId, email: 'x@example.in', membership: m, all: [m], staffRole: null }
  },
}))

const MEDIA = 'https://brandtest.public.blob.vercel-storage.com'
const raster = (t: string) => `${MEDIA}/tenants/${t}/brand/${randomUUID()}-400.webp`
const svg = (t: string) => `${MEDIA}/tenants/${t}/brand/${'a'.repeat(64)}.svg`

describe.skipIf(!host)('saveBrand', () => {
  let su: ReturnType<typeof postgres>
  let S: typeof import('../save')
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    await su`insert into tenants (id, slug, name) values (${T}, ${'brand-' + T.slice(0, 8)}, 'Brand test'), (${THEME}, ${'theme-' + THEME.slice(0, 8)}, 'Theme test')`
    await su`insert into shop_settings (tenant_id) values (${T}), (${THEME})`
    await su`insert into members (tenant_id, user_id, role) values (${T}, ${OWNER}, 'owner'), (${T}, ${ADMIN}, 'admin'), (${T}, ${STAFF}, 'staff'), (${THEME}, ${OWNER}, 'owner')`
    const email = `p-${T.slice(0, 8)}@example.in`
    const [p] = await su`insert into partners (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at, approved_at)
      values (${PARTNER}, ${email}, 'Neel', 'Neel Studio', '919845012399', 'Bengaluru', '{}', '', '1-4', 1, now(), now()) returning id`
    const [pm] = await su`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${p!.id}, ${PARTNER}, ${email}, 'owner', now()) returning id`
    await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${T}, ${PARTNER}, 'partner', ${pm!.id})`
    // A site being built: a live key makes it a code-site store (src/domains/brand/code-site.ts).
    await su`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values (${T}, 'public', 'Website', ${T.replace(/-/g, '').repeat(2)}, 'frs_pub_brand1', ${OWNER})`
    S = await import('../save')
  })
  const as = (userId: string, role: string, support: string | null = null, t = T) => { who = { userId, role, support, t } }
  const tokens = async () => (await su`select * from brand_tokens where tenant_id = ${T}`)[0]
  const logo = async (t = T) => (await su`select logo_url from shop_settings where tenant_id = ${t}`)[0]!.logo_url as string | null
  const limit = async () => Number((await su`select coalesce(sum(n), 0)::int n from rate_limits where key = encode(sha256(convert_to(${'brand_save:shop:' + T}, 'UTF8')), 'hex')`)[0]!.n)
  const open = (yes: boolean) => su`update shop_settings set published_at = ${yes ? new Date() : null} where tenant_id = ${T}`
  const AYUDA = { bg: '#fbf7f1', panel: '#F2EADF', text: '#221A14', muted: '#665A4E', accent: '#8C1D2C', on: '#FBF7F1', edge: '#9A8B7A', line: '#DDD0BE', good: '#2F6B3B', warn: '#8A5300', bad: '#A3261B' }

  it('the owner saves House of Ayuda live: colours normalised, the main logo in logo_url, the record before kept, an audit row of names only', async () => {
    as(OWNER, 'owner')
    const main = raster(T)
    const r = await S.saveBrand({ version: null, patch: { logos: { main }, palette: AYUDA, display: 'tiro', body: 'mukta', radius: 4 } })
    expect(r).toMatchObject({ ok: true, outcome: 'live', version: 1 })
    const row = await tokens()
    expect(row).toMatchObject({ color_bg: '#FBF7F1', font_display: 'tiro', font_body: 'mukta', radius: 4, density: 'standard', updated_by: OWNER })
    expect(row!.previous).toMatchObject({ display: 'inter', palette: { bg: '#FFFFFF' } })
    expect(await logo()).toBe(main)
    const [a] = await su`select action, detail from audit_events where tenant_id = ${T} order by at desc limit 1`
    expect(a!.action).toBe('brand.save')
    expect(JSON.stringify(a!.detail)).not.toMatch(/#8C1D2C|blob/)
  })

  it('refuses a stale version, a pair below contrast, another store\'s file, staff and a support visit, giving the limit back', async () => {
    as(OWNER, 'owner')
    const used = await limit()
    expect(await S.saveBrand({ version: 99, patch: { radius: 8 } })).toMatchObject({ ok: false, error: 'The brand changed since you opened it. Reload to see it.' })
    const low = await S.saveBrand({ version: 1, patch: { palette: { accent: '#D9822B' } } })
    expect(low.ok).toBe(false)
    expect(!low.ok && low.fields?.accent).toMatch(/^Text on this accent is 2\.\d\d:1\./)
    expect(await S.saveBrand({ version: 1, patch: { logos: { mark: svg(THEME) } } })).toMatchObject({ ok: false, fields: { mark: 'That file could not be used. Upload it again.' } })
    as(STAFF, 'staff')
    expect((await S.saveBrand({ version: 1, patch: { radius: 8 } })).ok).toBe(false)
    as(OWNER, 'owner', randomUUID())
    expect((await S.saveBrand({ version: 1, patch: { radius: 8 } })).ok).toBe(false)
    expect(await limit()).toBe(used)
    expect((await tokens())!.version).toBe(1)
  })

  it('Undo: only its saver, once, back to the record before', async () => {
    as(ADMIN, 'admin')
    expect((await S.undoBrand({ version: 1 })).ok).toBe(false) // the owner saved it
    as(OWNER, 'owner')
    const r = await S.saveBrand({ version: 1, patch: { radius: 8, density: 'roomy' } })
    expect(r).toMatchObject({ ok: true, outcome: 'live', version: 2 })
    expect(await S.undoBrand({ version: 2 })).toMatchObject({ ok: true, version: 3 })
    expect(await tokens()).toMatchObject({ radius: 4, density: 'standard', previous: null })
    expect((await S.undoBrand({ version: 3 })).ok).toBe(false)
  })

  it('the partner, before the store opens: live', async () => {
    as(PARTNER, 'partner')
    expect(await S.saveBrand({ version: 3, patch: { logos: { mark: svg(T) } } })).toMatchObject({ ok: true, outcome: 'live', version: 4 })
  })

  it('the partner, once open: waits for the owner; the live record unchanged; one line for owners and Managers; a newer save replaces it', async () => {
    await open(true)
    as(PARTNER, 'partner')
    const r = await S.saveBrand({ version: 4, patch: { logos: { stacked: svg(T), reversed: svg(T) }, display: 'inter' } })
    expect(r).toMatchObject({ ok: true, outcome: 'waits', version: 4 })
    expect((await tokens())!).toMatchObject({ version: 4, logo_stacked_url: null, font_display: 'tiro' })
    const [p] = await su`select id, summary, decided_at from brand_proposals where tenant_id = ${T}`
    expect(p).toMatchObject({ summary: '2 logo files and 1 font.', decided_at: null })
    const lines = await su`select type, source_id, href, by from notices where tenant_id = ${T} and source_kind = 'brand'`
    expect(lines).toEqual([{ type: 'needs_you', source_id: p!.id, href: '/console/brand', by: PARTNER }])
    const { listNotices } = await import('@/lib/queries/notices')
    const mine = await listNotices(T, OWNER, 'owner', 'Brand test')
    expect(mine.find((n) => n.brand)).toMatchObject({ title: 'Your partner changed your brand', body: '2 logo files and 1 font.', brand: { id: p!.id, state: 'open' } })
    expect((await listNotices(T, STAFF, 'staff', 'Brand test')).some((n) => n.brand)).toBe(false)
    expect((await listNotices(T, PARTNER, 'partner', 'Brand test')).some((n) => n.brand)).toBe(false) // never told of their own change
    const again = await S.saveBrand({ version: 4, patch: { display: 'fraunces' } })
    expect(again).toMatchObject({ outcome: 'waits' })
    const all = await su`select decision from brand_proposals where tenant_id = ${T} order by proposed_at`
    expect(all.map((x) => x.decision)).toEqual(['replaced', null])
    expect((await listNotices(T, OWNER, 'owner', 'Brand test')).find((n) => n.brand?.id === p!.id)?.brand?.state).toBe('replaced')
  })

  it('Approve puts it live for the owner or a Manager only; Decline drops it; an answered change stays answered', async () => {
    const [p] = await su`select id from brand_proposals where tenant_id = ${T} and decided_at is null`
    as(PARTNER, 'partner')
    expect((await S.decideBrand({ id: p!.id, decision: 'approve' })).ok).toBe(false)
    as(ADMIN, 'admin', randomUUID())
    expect((await S.decideBrand({ id: p!.id, decision: 'approve' })).ok).toBe(false) // a support visit never decides
    as(ADMIN, 'admin')
    expect(await S.decideBrand({ id: p!.id, decision: 'approve' })).toMatchObject({ ok: true, outcome: 'live', version: 5 })
    expect((await tokens())!).toMatchObject({ font_display: 'fraunces', updated_by: ADMIN })
    expect((await S.decideBrand({ id: p!.id, decision: 'decline' })).ok).toBe(false)
    // Undo after Approve: the approver's.
    expect((await S.undoBrand({ version: 5 })).ok).toBe(true)
    as(PARTNER, 'partner')
    await S.saveBrand({ version: 6, patch: { body: 'inter' } })
    const [q] = await su`select id from brand_proposals where tenant_id = ${T} and decided_at is null`
    as(OWNER, 'owner')
    expect(await S.decideBrand({ id: q!.id, decision: 'decline' })).toMatchObject({ ok: true, outcome: 'unchanged' })
    expect((await tokens())!.font_body).toBe('mukta')
    // A change made against an older record can't be approved over a newer one.
    as(PARTNER, 'partner')
    await S.saveBrand({ version: 6, patch: { body: 'inter' } })
    as(OWNER, 'owner')
    await S.saveBrand({ version: 6, patch: { radius: 12 } })
    const [z] = await su`select id from brand_proposals where tenant_id = ${T} and decided_at is null`
    expect((await S.decideBrand({ id: z!.id, decision: 'approve' })).ok).toBe(false)
    await S.decideBrand({ id: z!.id, decision: 'decline' })
    // Settings › Store details' logo goes through the same rule (setShopLogo calls saveBrand with the main logo alone).
    as(PARTNER, 'partner')
    const before = await logo()
    expect(await S.saveBrand({ patch: { logos: { main: raster(T) } } }, 'settings.brand.logo')).toMatchObject({ ok: true, outcome: 'waits' })
    expect(await logo()).toBe(before)
    await open(false)
  })

  it('a theme shop saves its logo only, live, and gets no record', async () => {
    as(OWNER, 'owner', null, THEME)
    const main = raster(THEME)
    expect(await S.saveBrand({ patch: { logos: { main } } }, 'settings.brand.logo')).toMatchObject({ ok: true, outcome: 'live' })
    expect(await logo(THEME)).toBe(main)
    expect((await S.saveBrand({ patch: { radius: 8 } })).ok).toBe(false)
    expect((await su`select 1 from brand_tokens where tenant_id = ${THEME}`).length).toBe(0)
  })
})
