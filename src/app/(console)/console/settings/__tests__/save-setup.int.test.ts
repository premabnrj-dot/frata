// A setup popup's save and read (saveSetupFields, loadSetupPopup; plan docs/plans/2026-11-23-o2a-setup-card.md O2a·5) on
// a real Postgres, as frata_app: only the popup's fields are written and a field it leaves out is never blanked; the
// version is checked; PP1's locks (Business and GST is the owner's page once the store has an owner, a support visit is
// read-only there), an open store's grievance officer and Delivery Zones' fields hold as on the Settings pages; a GSTIN
// saved with live products without a rate is said; Staff are refused. Sign-in is mocked, and so is whether Delivery Zones
// is usable (its own tests cover that); everything else is real. Skipped unless INT_DB_HOST is set. Its own store, left.
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const T = randomUUID()
const OWNER = randomUUID(), PARTNER = randomUUID(), STAFF = randomUUID()
const state = vi.hoisted(() => ({ who: { userId: '', role: 'owner', support: null as string | null }, zones: false, tenant: '' }))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (f: () => unknown) => f }))
vi.mock('next/server', () => ({ after: (f: () => void) => f() }))
vi.mock('@/lib/queries/storefront', () => ({ refreshShop: () => {}, shopCached: (_n: string, _s: string, f: unknown) => f, refreshHosts: () => {}, hostFor: (s: string) => `${s}.test` }))
vi.mock('@/lib/queries/modules', async (orig) => {
  const real = await orig<typeof import('@/lib/queries/modules')>()
  return { ...real, moduleAccessIn: async (...a: Parameters<typeof real.moduleAccessIn>) => {
    const r = await real.moduleAccessIn(...a)
    return state.zones ? { ...r, delivery_zones: { ...r.delivery_zones, usable: true } } : r
  } }
})
vi.mock('@/lib/auth/require-member', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-member')>()),
  requireMember: async (allowed: readonly string[]) => {
    if (!allowed.includes(state.who.role)) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
    const m = { tenantId: state.tenant, tenantName: 'Setup test', role: state.who.role, supportSessionId: state.who.support }
    return { ok: true, userId: state.who.userId, email: 'x@example.in', membership: m, all: [m], staffRole: null }
  },
}))

describe.skipIf(!host)('setup popups: saveSetupFields and loadSetupPopup (O2a·5)', () => {
  let su: ReturnType<typeof postgres>
  let A: typeof import('../setup-actions')
  const row = async () => (await su`select * from shop_settings where tenant_id = ${T}`)[0]!
  const as = (userId: string, role: string, support: string | null = null) => { state.who = { userId, role, support } }
  const version = async () => Number((await row()).version)
  let partnerMemberId = ''

  beforeAll(async () => {
    state.tenant = T
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    await su`insert into tenants (id, slug, name) values (${T}, ${'setup-' + T.slice(0, 8)}, 'Setup test')`
    await su`insert into shop_settings (tenant_id, sells, support_email, address, order_prefix, turnover_band, home_state, grievance_name, grievance_email, grievance_phone, pickup_pincode)
      values (${T}, ${['women']}, 'care@example.in', '12 MG Road, Indore', 'KS', '5_to_10cr', '23', 'Anita Rao', 'grievance@example.in', '9800000002', '452009')`
    await su`insert into members (tenant_id, user_id, role) values (${T}, ${STAFF}, 'staff')`
    const email = `p-${T.slice(0, 8)}@example.in`
    const [p] = await su`insert into partners (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at, approved_at)
      values (${PARTNER}, ${email}, 'Pia', 'Pia Studio', '919845012345', 'Jaipur', '{}', '', '1-4', 1, now(), now()) returning id`
    const [pm] = await su`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${p!.id}, ${PARTNER}, ${email}, 'owner', now()) returning id`
    partnerMemberId = pm!.id
    await su`insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (${T}, ${p!.id}, 2000, 24, 90)`
    await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${T}, ${PARTNER}, 'partner', ${partnerMemberId})`
    // The owner has accepted the handover: the store may open, and Business and GST is the owner's page.
    await su`insert into members (tenant_id, user_id, role) values (${T}, ${OWNER}, 'owner')`
    A = await import('../setup-actions')
  })
  afterAll(async () => { await su?.end() })

  it('details: writes the legal name and the grievance officer; address, customer care, order prefix and turnover stay', async () => {
    as(OWNER, 'owner')
    const before = await row()
    const r = await A.saveSetupFields('details', { legalName: 'Kesar Studio LLP', gstRegistration: 'none', homeState: '08', gstin: '', grievanceName: 'Meera Shah', grievancePhone: '98270 41002', grievanceEmail: 'meera@kesar.in' }, Number(before.version))
    expect(r).toMatchObject({ ok: true, version: Number(before.version) + 1 })
    expect(await row()).toMatchObject({ legal_name: 'Kesar Studio LLP', home_state: '08', gstin: null, grievance_name: 'Meera Shah', grievance_phone: '9827041002', grievance_email: 'meera@kesar.in',
      address: before.address, support_email: before.support_email, order_prefix: before.order_prefix, turnover_band: before.turnover_band, pickup_pincode: before.pickup_pincode })
    const [a] = await su`select action, detail from audit_events where tenant_id = ${T} order by at desc limit 1`
    expect(a!.action).toBe('settings.setup.details')
  })

  it('a GSTIN left out keeps the stored one; a stale version is a conflict and writes nothing', async () => {
    as(OWNER, 'owner')
    await su`update shop_settings set gstin = '29AAGCB7383J1Z4', gst_scheme = 'regular', home_state = '29' where tenant_id = ${T}`
    const v = await version()
    expect(await A.saveSetupFields('details', { legalName: 'Kesar Studio Pvt Ltd', gstRegistration: 'regular' }, v)).toMatchObject({ ok: true })
    expect(await row()).toMatchObject({ legal_name: 'Kesar Studio Pvt Ltd', gstin: '29AAGCB7383J1Z4', home_state: '29' })
    expect(await A.saveSetupFields('details', { legalName: 'Stale Ltd' }, v)).toMatchObject({ ok: false, conflict: true })
    expect((await row()).legal_name).toBe('Kesar Studio Pvt Ltd')
  })

  it('a GSTIN saved while live products have no rate is said (unrated), and saved', async () => {
    as(OWNER, 'owner')
    await su`update shop_settings set gstin = null, home_state = '29' where tenant_id = ${T}`
    await su`insert into products (tenant_id, handle, title, status, hsn) values (${T}, 'no-rate', 'No rate kurta', 'active', null)`
    const r = await A.saveSetupFields('details', { gstRegistration: 'regular', gstin: '29AAGCB7383J1Z4' }, await version())
    expect(r).toMatchObject({ ok: true, unrated: { count: 1, products: [{ title: 'No rate kurta', handle: 'no-rate' }] } })
    expect((await row()).gstin).toBe('29AAGCB7383J1Z4')
    await su`delete from products where tenant_id = ${T}`
  })

  it('Pay on delivery: saved; with Delivery Zones usable only the switch is written; a stale lowest order is said', async () => {
    as(OWNER, 'owner')
    expect(await A.saveSetupFields('payments', { codOn: true, codMax: '5,000' }, await version())).toMatchObject({ ok: true })
    expect(Number((await row()).cod_max)).toBe(500000)
    state.zones = true
    expect(await A.saveSetupFields('payments', { codOn: false, codMax: '1,000' }, await version())).toMatchObject({ ok: true })
    expect(await row()).toMatchObject({ cod_on: false })
    expect(Number((await row()).cod_max)).toBe(500000)
    state.zones = false
    await su`update shop_settings set cod_min = 400000 where tenant_id = ${T}`
    expect(await A.saveSetupFields('payments', { codOn: true, codMax: '3,000' }, await version())).toMatchObject({ ok: false, stale: ['codMin'] })
    await su`update shop_settings set cod_min = 0, cod_on = true where tenant_id = ${T}`
  })

  it('pickup: writes only the PIN code', async () => {
    as(OWNER, 'owner')
    const before = await row()
    expect(await A.saveSetupFields('pickup', { pickupPincode: '302003' }, Number(before.version))).toMatchObject({ ok: true })
    const after = await row()
    const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
    expect(changed.sort()).toEqual(['pickup_pincode', 'updated_at', 'version'])
  })

  it('keys a popup does not own are refused, never written', async () => {
    as(OWNER, 'owner')
    expect(await A.saveSetupFields('pickup', { pickupPincode: '302003', address: 'Elsewhere' } as never, await version())).toMatchObject({ ok: false })
    expect((await row()).address).toBe('12 MG Road, Indore')
    expect(await A.saveSetupFields('nope' as never, {}, await version())).toMatchObject({ ok: false })
  })

  it('an open store blanking the grievance phone is refused at the field', async () => {
    as(OWNER, 'owner')
    await su`update shop_settings set published_at = now() where tenant_id = ${T}`
    const r = await A.saveSetupFields('details', { grievanceName: 'Meera Shah', grievancePhone: '', grievanceEmail: 'meera@kesar.in' }, await version())
    expect(r).toMatchObject({ ok: false, errors: { grievancePhone: expect.stringContaining('keep the grievance officer') } })
    expect((await row()).grievance_phone).toBe('9827041002')
    await su`update shop_settings set published_at = null where tenant_id = ${T}`
  })

  it('Staff may not save a setup popup; the read refuses them too', async () => {
    as(STAFF, 'staff')
    expect(await A.saveSetupFields('payments', { codOn: false }, await version())).toMatchObject({ ok: false })
    expect((await row()).cod_on).toBe(true)
    expect(await A.loadSetupPopup('payments')).toMatchObject({ ok: false })
  })

  it('the read: the popup’s values and version, the grievance email filled from customer care when empty', async () => {
    as(OWNER, 'owner')
    await su`update shop_settings set grievance_email = '' where tenant_id = ${T}`
    const r = await A.loadSetupPopup('details')
    expect(r).toMatchObject({ ok: true, version: await version(), locked: false, held: false,
      values: { legalName: 'Kesar Studio Pvt Ltd', gstRegistration: 'regular', gstin: '29AAGCB7383J1Z4', grievanceEmail: 'care@example.in' } })
    if (r.ok) expect(Object.keys(r.values).sort()).toEqual(['grievanceEmail', 'grievanceName', 'grievancePhone', 'gstRegistration', 'gstin', 'homeState', 'legalName'])
    state.zones = true
    expect(await A.loadSetupPopup('payments')).toMatchObject({ ok: true, held: true, values: { codOn: true, codMax: '5,000' } })
    state.zones = false
    await su`update shop_settings set grievance_email = 'meera@kesar.in' where tenant_id = ${T}`
  })

  it('the partner’s details, now the store has an owner, are locked (read and save); a support visit is locked for details and saves payments, audited', async () => {
    as(PARTNER, 'partner')
    expect(await A.loadSetupPopup('details')).toMatchObject({ ok: true, locked: true })
    expect(await A.saveSetupFields('details', { legalName: 'Someone Else' }, await version())).toMatchObject({ ok: false, locked: true })
    expect((await row()).legal_name).toBe('Kesar Studio Pvt Ltd')
    const [s] = await su`insert into support_sessions (tenant_id, staff_user_id, staff_email, reason, expires_at) values (${T}, ${randomUUID()}, 'staff@frrata.test', 'setup_help', now() + interval '30 minutes') returning id`
    as(randomUUID(), 'owner', s!.id)
    expect(await A.saveSetupFields('details', { legalName: 'Support Ltd' }, await version())).toMatchObject({ ok: false, locked: true })
    expect(await A.saveSetupFields('payments', { codOn: true, codMax: '2,500' }, await version())).toMatchObject({ ok: true })
    const [a] = await su`select actor_kind, action from audit_events where tenant_id = ${T} and support_session_id = ${s!.id}`
    expect(a).toMatchObject({ actor_kind: 'support', action: 'settings.setup.payments' })
  })
})
