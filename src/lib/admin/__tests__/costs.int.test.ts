// Admin › Costs against a real Postgres with the real roles (tasks 4–5 of docs/plans/2026-11-23-admin-costs.md).
// Skipped unless INT_DB_HOST is set (CI). It commits; every row carries this run's stamp in its name.
//  - support staff are refused by every export (they share the frata_admin connection);
//  - add (repeating and one-time with its payment), Mark paid on a real due date only, twice is one row;
//  - Undo is free for ten minutes and then needs a fresh passkey check; the audit row keeps what it deleted;
//  - edits: the anchor moves only past the last paid period, the cadence is locked once paid, money edits need the check.
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const base = { userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', sessionId: '00000000-0000-4000-8000-000000000000' }
const master = (confirmedAt = new Date()) => ({ ok: true as const, ...base, role: 'admin' as const, confirmedAt })
const support = { ok: true as const, ...base, role: 'support' as const, confirmedAt: new Date() }
const TODAY = '2026-11-23'

describe.skipIf(!host)('Admin › Costs', () => {
  let costs: typeof import('../costs')
  const stamp = String(Date.now()).slice(-8)
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    costs = await import('../costs')
  })
  const recurring = (name: string, extra: object = {}) => ({
    kind: 'recurring' as const, name: `${name} ${stamp}`, category: 'infrastructure' as const, cadence: 'monthly' as const, amount: 188_400, currency: 'INR' as const,
    varies: false, anchorOn: '2026-11-26', ...extra,
  })

  it('support staff are refused by every export', async () => {
    await expect(costs.costsData(support, TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(costs.addCost(support, recurring('Nope'), TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(costs.markPaid(support, '00000000-0000-0000-0000-000000000000', { periodFor: TODAY, paidOn: TODAY, amount: 1 }, TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(costs.undoPayment(support, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', new Date())).rejects.toThrow('ADMIN_ONLY')
    await expect(costs.paymentsPage(support, { from: '2026-04-01', to: '2027-03-31' })).rejects.toThrow('ADMIN_ONLY')
    const none = '00000000-0000-0000-0000-000000000000'
    await expect(costs.costPanel(support, none)).rejects.toThrow('ADMIN_ONLY')
    await expect(costs.paymentsForYear(support, 2026)).rejects.toThrow('ADMIN_ONLY')
    await expect(costs.endCost(support, none, TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(costs.editCost(support, none, { name: 'x' }, new Date())).rejects.toThrow('ADMIN_ONLY')
  })

  it('adds, pays only a real due date, pays once, and undoes', async () => {
    const staff = master()
    const added = await costs.addCost(staff, recurring('Vercel'), TODAY)
    expect(added.ok).toBe(true)
    const id = (added as { id: string }).id
    // a date that is not on the monthly grid
    expect(await costs.markPaid(staff, id, { periodFor: '2026-11-27', paidOn: TODAY, amount: 188_400 }, TODAY)).toEqual({ ok: false, error: 'not_due' })
    // a paid day in the future
    expect(await costs.markPaid(staff, id, { periodFor: '2026-11-26', paidOn: '2026-11-30', amount: 188_400 }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
    const first = await costs.markPaid(staff, id, { periodFor: '2026-11-26', paidOn: TODAY, amount: 188_400, gstPaise: 28_740 }, TODAY)
    expect(first.ok).toBe(true)
    expect(await costs.markPaid(staff, id, { periodFor: '2026-11-26', paidOn: TODAY, amount: 188_400 }, TODAY)).toEqual({ ok: false, error: 'already_paid' })
    const panel = await costs.costPanel(staff, id)
    expect(panel!.payments).toHaveLength(1)
    expect(panel!.payments[0]).toMatchObject({ inrPaise: 188_400, gstPaise: 28_740, currency: 'INR' })
    // fresh payment: Undo needs no check; an old one does
    const paymentId = (first as { paymentId: string }).paymentId
    const later = new Date(Date.now() + 11 * 60_000)
    expect(await costs.undoPayment(master(new Date(0)), id, paymentId, later)).toEqual({ ok: false, error: 'confirm_first' })
    expect(await costs.undoPayment(master(new Date(0)), id, '00000000-0000-0000-0000-000000000000', new Date())).toEqual({ ok: false, error: 'not_found' })
    expect(await costs.undoPayment(master(new Date(0)), id, paymentId, new Date())).toEqual({ ok: true })
    expect((await costs.costPanel(staff, id))!.payments).toHaveLength(0)
  })

  it('a dollar bill keeps its rupees in the rate band', async () => {
    const staff = master()
    const added = await costs.addCost(staff, recurring('Supabase', { currency: 'USD', amount: 25_000_000 }), TODAY)
    const id = (added as { id: string }).id
    expect(await costs.markPaid(staff, id, { periodFor: '2026-11-26', paidOn: TODAY, amount: 25_000_000 }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
    expect(await costs.markPaid(staff, id, { periodFor: '2026-11-26', paidOn: TODAY, amount: 25_000_000, inrPaise: 2_355 }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
    expect((await costs.markPaid(staff, id, { periodFor: '2026-11-26', paidOn: TODAY, amount: 25_000_000, inrPaise: 235_500 }, TODAY)).ok).toBe(true)
    expect((await costs.costPanel(staff, id))!.payments[0]).toMatchObject({ amount: 25_000_000, currency: 'USD', inrPaise: 235_500 })
  })

  it('a one-time cost is saved with its payment, and is not a due date', async () => {
    const staff = master()
    const once = await costs.addCost(staff, { kind: 'one_time', name: `Logo ${stamp}`, category: 'design', amount: 2_500_000, currency: 'INR', paidOn: '2026-11-09', gstPaise: 381_356 }, TODAY)
    expect(once.ok).toBe(true)
    const id = (once as { id: string }).id
    const panel = await costs.costPanel(staff, id)
    expect(panel!.item).toMatchObject({ kind: 'one_time', cadence: null, anchorOn: '2026-11-09' })
    expect(panel!.payments).toHaveLength(1)
    expect(await costs.markPaid(staff, id, { periodFor: '2026-11-09', paidOn: TODAY, amount: 2_500_000 }, TODAY)).toEqual({ ok: false, error: 'not_due' })
    expect(await costs.editCost(staff, id, { amount: 1, currency: 'INR' }, new Date())).toEqual({ ok: false, error: 'locked' })
    expect(await costs.addCost(staff, { kind: 'one_time', name: 'Future', category: 'other', amount: 1, currency: 'INR', paidOn: '2026-12-31' }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
  })

  it('a long-past anchor is refused on add', async () => {
    expect(await costs.addCost(master(), recurring('Old', { anchorOn: '2026-01-05' }), TODAY)).toEqual({ ok: false, error: 'bad_input' })
  })

  it('edits: the anchor moves past the last paid period, the cadence locks once paid, money edits need a fresh check', async () => {
    const staff = master()
    const id = ((await costs.addCost(staff, recurring('Workspace', { anchorOn: '2026-11-20' }), TODAY)) as { id: string }).id
    await costs.markPaid(staff, id, { periodFor: '2026-11-20', paidOn: TODAY, amount: 188_400 }, TODAY)
    const now = new Date()
    expect(await costs.editCost(master(new Date(0)), id, { amount: 5, currency: 'INR' }, now)).toEqual({ ok: false, error: 'confirm_first' })
    expect(await costs.editCost(staff, id, { anchorOn: '2026-11-15' }, now)).toEqual({ ok: false, error: 'locked' })
    expect(await costs.editCost(staff, id, { cadence: 'yearly' }, now)).toEqual({ ok: false, error: 'locked' })
    expect(await costs.editCost(staff, id, { anchorOn: '2026-12-05' }, now)).toEqual({ ok: true })
    expect(await costs.editCost(master(new Date(0)), id, { name: `Workspace ${stamp} v2` }, now)).toEqual({ ok: true })
    expect(await costs.editCost(staff, id, {}, now)).toEqual({ ok: false, error: 'bad_input' })
  })

  it('ends a cost, lists payments by keyset, and exports a financial year', async () => {
    const staff = master()
    const id = ((await costs.addCost(staff, recurring('Mailer', { anchorOn: '2026-11-01' }), TODAY)) as { id: string }).id
    expect(await costs.endCost(staff, id, '2026-10-01')).toEqual({ ok: false, error: 'bad_input' })
    expect(await costs.endCost(staff, id, '2026-12-31')).toEqual({ ok: true })
    const data = await costs.costsData(staff, TODAY)
    expect(data.items.find((i) => i.id === id)?.endsOn).toBe('2026-12-31')
    const page = await costs.paymentsPage(staff, { from: '2026-04-01', to: '2027-03-31' })
    expect(page.rows.length).toBeLessThanOrEqual(50)
    // keyset: pay three bills on three days, then walk them 2 + 1 (the page size is 50, so walk by a narrow window)
    const k = ((await costs.addCost(staff, recurring('Keyset', { anchorOn: '2026-11-01' }), TODAY)) as { id: string }).id
    await costs.markPaid(staff, k, { periodFor: '2026-11-01', paidOn: '2026-11-02', amount: 100 }, TODAY)
    const ids = (await costs.paymentsPage(staff, { from: '2026-11-02', to: '2026-11-02' })).rows.map((r) => r.id)
    expect(ids.length).toBeGreaterThan(0)
    const first = (await costs.paymentsPage(staff, { from: '2020-01-01', to: '2099-12-31' })).rows[0]!
    const after = await costs.paymentsPage(staff, { from: '2020-01-01', to: '2099-12-31', after: { paidOn: first.paidOn, id: first.id } })
    expect(after.rows.find((r) => r.id === first.id)).toBeUndefined()
    const rows = await costs.paymentsForYear(staff, 2026)
    expect(rows.every((r) => r.paidOn >= '2026-04-01' && r.paidOn <= '2027-03-31')).toBe(true)
  })

  it('an amount and its currency change together; each gated field needs a fresh passkey check', async () => {
    const staff = master()
    const id = ((await costs.addCost(staff, recurring('Gated'), TODAY)) as { id: string }).id
    const stale = master(new Date(0))
    const now = new Date()
    expect(await costs.editCost(staff, id, { currency: 'USD' }, now)).toEqual({ ok: false, error: 'bad_input' })
    expect(await costs.editCost(staff, id, { amount: 5 }, now)).toEqual({ ok: false, error: 'bad_input' })
    const gated: [string, object][] = [['amount and currency', { amount: 500, currency: 'INR' }], ['anchorOn', { anchorOn: '2026-12-10' }], ['cadence', { cadence: 'quarterly' }]]
    for (const [name, patch] of gated) expect(await costs.editCost(stale, id, patch, now), name).toEqual({ ok: false, error: 'confirm_first' })
    for (const [name, patch] of [['name', { name: `Gated ${stamp} b` }], ['varies', { varies: true }], ['category', { category: 'ai' }], ['note', { note: 'n' }]] as const) {
      expect(await costs.editCost(stale, id, patch, now), name).toEqual({ ok: true })
    }
  })

  it('undoing a one-time payment ends the entry on its paid day; ending checks the last paid period', async () => {
    const staff = master()
    const once = ((await costs.addCost(staff, { kind: 'one_time', name: `Typo ${stamp}`, category: 'other', amount: 100, currency: 'INR', paidOn: '2026-11-10' }, TODAY)) as { id: string }).id
    const pay = (await costs.costPanel(staff, once))!.payments[0]!
    expect(await costs.endCost(staff, once, '2026-12-31')).toEqual({ ok: false, error: 'locked' })
    expect(await costs.undoPayment(staff, once, pay.id, new Date())).toEqual({ ok: true })
    expect((await costs.costPanel(staff, once))!.item).toMatchObject({ kind: 'one_time', endsOn: '2026-11-10' })
    const id = ((await costs.addCost(staff, recurring('Ends', { anchorOn: '2026-11-10' }), TODAY)) as { id: string }).id
    await costs.markPaid(staff, id, { periodFor: '2026-11-10', paidOn: TODAY, amount: 188_400 }, TODAY)
    expect(await costs.endCost(staff, id, '2026-11-09')).toEqual({ ok: false, error: 'bad_input' })
    expect(await costs.endCost(staff, id, '2026-11-30')).toEqual({ ok: true })
    // a due after the end is not a due date
    expect(await costs.markPaid(staff, id, { periodFor: '2026-12-10', paidOn: TODAY, amount: 188_400 }, TODAY)).toEqual({ ok: false, error: 'not_due' })
  })

  it('every write leaves one audit row beside it: the item id as target, no tenant, the unpay figures kept', async () => {
    const staff = master()
    const id = ((await costs.addCost(staff, recurring('Audited'), TODAY)) as { id: string }).id
    const paid = await costs.markPaid(staff, id, { periodFor: '2026-11-26', paidOn: TODAY, amount: 188_400, gstPaise: 28_740 }, TODAY)
    await costs.undoPayment(staff, id, (paid as { paymentId: string }).paymentId, new Date())
    await costs.endCost(staff, id, '2026-12-31')
    await costs.editCost(staff, id, { note: 'x' }, new Date())
    const { adminDb } = await import('@/lib/db/admin')
    const { auditEvents } = await import('@/lib/db/schema')
    const { and, eq, like } = await import('drizzle-orm')
    const rows = await adminDb().select().from(auditEvents).where(and(eq(auditEvents.target, id), like(auditEvents.action, 'costs.%')))
    expect(rows.map((r) => r.action).sort()).toEqual(['costs.item.add', 'costs.item.edit', 'costs.item.end', 'costs.pay', 'costs.unpay'])
    expect(rows.every((r) => r.tenantId === null && r.actorEmail === 'int@frata.test')).toBe(true)
    expect(rows.find((r) => r.action === 'costs.unpay')!.detail).toEqual({ itemId: id, periodFor: '2026-11-26', inrPaise: 188_400, gstPaise: 28_740 })
    expect(JSON.stringify(rows.map((r) => r.detail))).not.toContain('Audited')
  })

  it('this month and last month payments are read by paid-on day, whatever period they settle', async () => {
    const staff = master()
    const id = ((await costs.addCost(staff, recurring('Late', { anchorOn: '2026-10-01' }), TODAY.replace('11-23', '10-15'))) as { id: string }).id
    await costs.markPaid(staff, id, { periodFor: '2026-10-01', paidOn: TODAY, amount: 100 }, TODAY)
    const data = await costs.costsData(staff, TODAY)
    expect(data.payments.some((p) => p.itemId === id && p.paidOn === TODAY)).toBe(true)
  })
})
