// Settings' owner-only saves on a real Postgres, as frata_app (partner publishing PP1, docs/specs/2026-11-16-partner-
// publishing.md § PP1 plan, tasks 2 and 4): before handover the partner saves everything; after it, Policies (the page
// and each policy page's own words, edit and reset) and Business and GST are refused in words, the grievance officer and
// the invoice signatory and series are never written for the partner (an omitted key can't blank them) and are refused
// in words when sent changed, while the rest of Contact and Invoices and slips still saves; an owner saves all; a
// support visit is refused the same, before or after handover. Ask the owner writes one line a page a day, for the
// partner only, seen by owners and Managers only. Sign-in is mocked; everything else is real. Skipped unless INT_DB_HOST
// is set. It uses a store of its own (a fresh id) and leaves it.
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const T = randomUUID()
const OWNER = randomUUID(), ADMIN = randomUUID(), PARTNER = randomUUID(), STAFF = randomUUID()
let who: { userId: string; role: string; support: string | null } = { userId: PARTNER, role: 'partner', support: null }

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (f: () => unknown) => f }))
vi.mock('next/server', () => ({ after: (f: () => void) => f() }))
vi.mock('@/lib/queries/storefront', () => ({ refreshShop: () => {}, refreshHosts: () => {}, hostFor: (s: string) => `${s}.test` }))
vi.mock('@/lib/auth/require-member', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-member')>()),
  requireMember: async (allowed: readonly string[]) => {
    if (!allowed.includes(who.role)) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
    const m = { tenantId: T, tenantName: 'Owner-only test', role: who.role, supportSessionId: who.support }
    return { ok: true, userId: who.userId, email: 'x@example.in', membership: m, all: [m], staffRole: null }
  },
}))

describe.skipIf(!host)('Settings: owner-only after handover (PP1)', () => {
  let su: ReturnType<typeof postgres>
  let A: typeof import('../actions')
  let S: typeof import('@/domains/settings/sections')
  let read: () => Promise<Record<string, unknown>>
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    await su`insert into tenants (id, slug, name) values (${T}, ${'owner-only-' + T.slice(0, 8)}, 'Owner-only test')`
    await su`insert into shop_settings (tenant_id, support_email, home_state, legal_name, grievance_name, grievance_role, grievance_email, grievance_phone, doc_signatory, invoice_series)
      values (${T}, 'care@example.in', '29', 'Ayuda Crafts', 'Anita Rao', 'Founder', 'grievance@example.in', '9800000002', 'Anita Rao', 'AY/')`
    const email = `p-${T.slice(0, 8)}@example.in`
    const [p] = await su`insert into partners (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at, approved_at)
      values (${PARTNER}, ${email}, 'Pia', 'Pia Studio', '919845012345', 'Jaipur', '{}', '', '1-4', 1, now(), now()) returning id`
    const [pm] = await su`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${p!.id}, ${PARTNER}, ${email}, 'owner', now()) returning id`
    await su`insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (${T}, ${p!.id}, 2000, 24, 90)`
    await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${T}, ${PARTNER}, 'partner', ${pm!.id})`
    A = await import('../actions')
    S = await import('@/domains/settings/sections')
    const { withTenant } = await import('@/lib/db/tenant')
    const { shopSettings } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    read = async () => (await withTenant(T, (tx) => tx.select().from(shopSettings).where(eq(shopSettings.tenantId, T))))[0] as Record<string, unknown>
  })
  afterAll(async () => { await su?.end() })
  const as = (userId: string, role: string, support: string | null = null) => { who = { userId, role, support } }
  /** What the form would send: the stored values, as the page draws them, with these changes. */
  const form = async (key: string, change: Record<string, string | boolean> = {}, omit: string[] = []) => {
    const row = await read()
    const v = { ...S.formValues(S.sectionFor(key)!, { ...row, name: 'Owner-only test' }), ...change }
    for (const k of omit) delete v[k]
    return { values: v, version: row.version as number }
  }
  const save = async (key: string, change: Record<string, string | boolean> = {}, omit: string[] = []) => {
    const f = await form(key, change, omit)
    return A.saveSection(key, f.values, f.version)
  }
  const policy = async () => (await su`select kind, body from shop_policies where tenant_id = ${T} order by kind`)

  it('before handover the partner saves Policies, Business and GST, the grievance officer and the invoice details', async () => {
    as(PARTNER, 'partner')
    expect(await save('business', { legalName: 'Ayuda Crafts LLP' })).toMatchObject({ ok: true })
    expect(await save('policies', { returnDays: '10' })).toMatchObject({ ok: true })
    expect(await save('contact', { grievanceRole: 'Partner' })).toMatchObject({ ok: true })
    expect(await save('invoices', { docSignatory: 'Pia', invoiceSeries: 'AY-' })).toMatchObject({ ok: true })
    expect(await A.savePolicyText('privacy', 'Our own words.')).toEqual({ ok: true })
    expect(await A.savePolicyText('privacy', null)).toEqual({ ok: true })
    const r = await read()
    expect(r).toMatchObject({ legalName: 'Ayuda Crafts LLP', returnDays: 10, grievanceRole: 'Partner', docSignatory: 'Pia', invoiceSeries: 'AY-' })
    // Before handover there is no one to ask.
    expect((await A.askOwnerAction('contact')).ok).toBe(false)
    // Put the store back as it was for the next steps.
    await su`update shop_settings set grievance_role = 'Founder', doc_signatory = 'Anita Rao', invoice_series = 'AY/' where tenant_id = ${T}`
  })

  it('after handover: Policies and Business and GST are refused in words, nothing changes, for every policy page too', async () => {
    await su`insert into members (tenant_id, user_id, role) values (${T}, ${OWNER}, 'owner'), (${T}, ${ADMIN}, 'admin'), (${T}, ${STAFF}, 'staff')`
    as(PARTNER, 'partner')
    const before = await read()
    const rows = async () => (await su`select count(*)::int n from audit_events where tenant_id = ${T} and actor_user_id = ${PARTNER}`)[0]!.n
    const audited = await rows()
    expect(await save('business', { legalName: 'Someone Else Pvt Ltd' })).toEqual({ ok: false, locked: true, error: 'Only the owner or a Manager can change this now.' })
    expect(await save('policies', { returnDays: '30' })).toEqual({ ok: false, locked: true, error: 'Only the owner or a Manager can change this now.' })
    // Even a save that changes nothing on a locked page is refused: the page is the owner's.
    expect((await save('business')).ok).toBe(false)
    await su`insert into shop_policies (tenant_id, kind, body, updated_by) values (${T}, 'terms', 'The owner''s terms.', ${OWNER})`
    expect(await A.savePolicyText('terms', 'A partner’s terms.')).toEqual({ ok: false, locked: true, error: 'Only the owner or a Manager can change this now.' })
    expect(await A.savePolicyText('terms', null)).toEqual({ ok: false, locked: true, error: 'Only the owner or a Manager can change this now.' })
    expect(await A.savePolicyText('shipping', 'New words.')).toMatchObject({ ok: false, locked: true })
    expect(await policy()).toEqual([{ kind: 'terms', body: 'The owner\'s terms.' }])
    const after = await read()
    expect(after.version).toBe(before.version)
    expect(after).toMatchObject({ legalName: before.legalName, returnDays: before.returnDays })
    // No Activity row for a refused save.
    expect(await rows()).toBe(audited)
  })

  it('after handover, Contact: grievance keys omitted are never blanked and the rest saves; changed, the save is refused in words', async () => {
    as(PARTNER, 'partner')
    // Omitted: customer care saves; the grievance officer stays as stored (dropped from what is written).
    const grievance = ['grievanceName', 'grievanceRole', 'grievanceEmail', 'grievancePhone']
    expect(await save('contact', { supportPhone: '9800000000' }, grievance)).toMatchObject({ ok: true })
    expect(await read()).toMatchObject({ supportPhone: '9800000000', grievanceName: 'Anita Rao', grievanceRole: 'Founder', grievanceEmail: 'grievance@example.in', grievancePhone: '9800000002' })
    // Sent as stored, but written differently (the same normalisation the save applies): not a change, it saves.
    expect(await save('contact', { instagram: '@houseofayuda', grievanceEmail: 'GRIEVANCE@example.in', grievancePhone: '+91 98000-00002' })).toMatchObject({ ok: true })
    expect(await read()).toMatchObject({ instagram: 'houseofayuda', grievanceEmail: 'grievance@example.in', grievancePhone: '9800000002' })
    // Changed: refused in the Contact words; customer care in the same save does not change either.
    const v = (await read()).version
    expect(await save('contact', { whatsapp: '9800000001', grievanceName: 'Pia' })).toEqual({ ok: false, locked: true, error: 'Only the owner or a Manager can change the grievance officer now.' })
    expect(await save('contact', { grievancePhone: '' })).toMatchObject({ ok: false, locked: true })
    expect(await read()).toMatchObject({ version: v, whatsapp: '', grievanceName: 'Anita Rao', grievancePhone: '9800000002' })
    // The Activity row names only what was written.
    const [a] = await su`select detail from audit_events where tenant_id = ${T} and actor_user_id = ${PARTNER} and action = 'settings.contact' order by at desc limit 1`
    expect((a!.detail as { fields: string[] }).fields.filter((k) => k.startsWith('grievance'))).toEqual([])
  })

  it('after handover, Invoices and slips: the signatory and series are held; the order prefix, the note and the slip size save', async () => {
    as(PARTNER, 'partner')
    expect(await save('invoices', { orderPrefix: 'ay', docNote: 'Thank you for shopping handloom.', slipSize: 'label' })).toMatchObject({ ok: true })
    expect(await read()).toMatchObject({ orderPrefix: 'AY', docNote: 'Thank you for shopping handloom.', slipSize: 'label', docSignatory: 'Anita Rao', invoiceSeries: 'AY/' })
    expect(await save('invoices', { invoiceSeries: 'PS/' })).toEqual({ ok: false, locked: true, error: 'Only the owner or a Manager can change these invoice details now.' })
    expect(await save('invoices', { docSignatory: 'Pia' })).toMatchObject({ ok: false, locked: true })
    expect(await save('invoices', { docNote: 'Omitted ones stay.' }, ['docSignatory', 'invoiceSeries'])).toMatchObject({ ok: true })
    expect(await read()).toMatchObject({ docNote: 'Omitted ones stay.', docSignatory: 'Anita Rao', invoiceSeries: 'AY/' })
  })

  it('an owner and a Manager save every one of them, policy pages included', async () => {
    as(OWNER, 'owner')
    expect(await save('business', { legalName: 'Ayuda Crafts Private Limited' })).toMatchObject({ ok: true })
    expect(await save('contact', { grievanceName: 'Ravi Rao' })).toMatchObject({ ok: true })
    expect(await save('invoices', { docSignatory: 'Ravi Rao', invoiceSeries: 'AC/' })).toMatchObject({ ok: true })
    expect(await A.savePolicyText('terms', 'Revised terms.')).toEqual({ ok: true })
    as(ADMIN, 'admin')
    expect(await save('policies', { returnDays: '15' })).toMatchObject({ ok: true })
    expect(await A.savePolicyText('terms', null)).toEqual({ ok: true })
    expect(await read()).toMatchObject({ legalName: 'Ayuda Crafts Private Limited', grievanceName: 'Ravi Rao', docSignatory: 'Ravi Rao', invoiceSeries: 'AC/', returnDays: 15 })
    expect(await policy()).toEqual([])
  })

  it('a support visit is read-only on them, before and after handover, and still saves customer care', async () => {
    const [s] = await su`insert into support_sessions (tenant_id, staff_user_id, staff_email, reason, expires_at) values (${T}, ${randomUUID()}, 'staff@frrata.test', 'fix_problem', now() + interval '30 minutes') returning id`
    as(randomUUID(), 'owner', s!.id as string)
    expect(await save('business', { legalName: 'Support Pvt Ltd' })).toMatchObject({ ok: false, locked: true })
    expect(await A.savePolicyText('terms', 'Support terms.')).toMatchObject({ ok: false, locked: true })
    expect(await save('contact', { grievanceName: 'Support' })).toMatchObject({ ok: false, locked: true, error: 'Only the owner or a Manager can change the grievance officer now.' })
    expect(await save('contact', { supportPhone: '9811111111' })).toMatchObject({ ok: true })
    expect((await A.askOwnerAction('contact')).ok).toBe(false)
    // Before handover too (decision 5): the owner's rows taken away for a moment.
    await su`update members set role = 'admin' where tenant_id = ${T} and user_id = ${OWNER}`
    expect(await save('business', { legalName: 'Support Pvt Ltd' })).toMatchObject({ ok: false, locked: true })
    await su`update members set role = 'owner' where tenant_id = ${T} and user_id = ${OWNER}`
    expect(await read()).toMatchObject({ legalName: 'Ayuda Crafts Private Limited', grievanceName: 'Ravi Rao', supportPhone: '9811111111' })
    const audit = await su`select action, detail from audit_events where tenant_id = ${T} and actor_kind = 'support'`
    expect(audit.map((x) => x.action)).toEqual(['settings.contact']) // refused saves leave no row
    await su`update support_sessions set ended_at = now() where id = ${s!.id}`
  })

  it('Ask the owner: the partner only, one line a page a day, seen by owners and Managers only, worded from the page', async () => {
    const asks = async () => (await su`select href, type, title, body, by, required, email from notices where tenant_id = ${T} and source_kind = 'ask_owner' order by created_at`)
    as(OWNER, 'owner')
    expect((await A.askOwnerAction('contact')).ok).toBe(false) // an owner has no one to ask
    as(STAFF, 'staff')
    expect((await A.askOwnerAction('contact')).ok).toBe(false) // staff don't open these pages
    as(PARTNER, 'partner')
    expect(await A.askOwnerAction('nothing')).toEqual({ ok: false, error: 'Unknown page.' })
    expect(await A.askOwnerAction('contact')).toEqual({ ok: true })
    expect(await A.askOwnerAction('contact')).toEqual({ ok: true }) // already asked today: the same answer, no second line
    expect(await A.askOwnerAction('policies')).toEqual({ ok: true })
    expect(await asks()).toEqual([
      { href: '/console/settings/contact', type: 'needs_you', title: null, body: null, by: PARTNER, required: false, email: true },
      { href: '/console/settings/policies', type: 'needs_you', title: null, body: null, by: PARTNER, required: false, email: true },
    ])
    // Yesterday's ask doesn't stop today's.
    await su`update notices set created_at = now() - interval '1 day' where tenant_id = ${T} and source_kind = 'ask_owner' and href = '/console/settings/contact'`
    expect(await A.askOwnerAction('contact')).toEqual({ ok: true })
    expect(await asks()).toHaveLength(3)
    const { listNotices } = await import('@/lib/queries/notices')
    const titles = async (user: string, role: string) => (await listNotices(T, user, role, 'Owner-only test')).filter((n) => /asks you/.test(n.title)).map((n) => `${n.title} · ${n.body}`)
    expect(await titles(OWNER, 'owner')).toEqual([
      'Your partner asks you to update the grievance officer · See it in Settings.',
      'Your partner asks you to update your policies · See it in Settings.',
      'Your partner asks you to update the grievance officer · See it in Settings.',
    ])
    expect(await titles(ADMIN, 'admin')).toHaveLength(3)
    expect(await titles(STAFF, 'staff')).toEqual([])
    expect(await titles(PARTNER, 'partner')).toEqual([])
  })
})
