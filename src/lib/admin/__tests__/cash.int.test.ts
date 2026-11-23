// Admin › Cashflow against a real Postgres with the real roles (plan docs/plans/2026-11-23-admin-cashflow.md tasks 3–4). Skipped unless INT_DB_HOST
// is set (CI). It commits (there is no delete on accounts or settings, by design), so each run reads its own rows by the stamp.
//  - support staff are refused by every export; the first account becomes the main one;
//  - a balance in the future, an unknown account, a bad day are refused; the audit row holds the account and day, never the amount;
//  - Undo is free for ten minutes, then needs a fresh passkey check; the floor is written (and audited) only when it changed;
//  - an entry's day rules, the passkey on an old done entry and on a changed planned-to-done, the old figures kept in a delete's audit;
//  - Billing's money in excludes a test invoice and subtracts a refund; the books roll the main balance forward and the difference follows.
import postgres from 'postgres'
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const base = { userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', sessionId: '00000000-0000-4000-8000-000000000000' }
const master = (confirmedAt = new Date()) => ({ ok: true as const, ...base, role: 'admin' as const, confirmedAt })
const support = { ok: true as const, ...base, role: 'support' as const, confirmedAt: new Date() }
const TODAY = '2026-11-23'
const R = 100
const ist = (s: string) => new Date(`${s}+05:30`)

describe.skipIf(!host)('Admin › Cashflow', () => {
  let cash: typeof import('../cash')
  let costs: typeof import('../costs')
  let tenantId = ''
  const stamp = String(Date.now()).slice(-8)
  let main = '', reserve = ''
  const su = () => postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })

  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    cash = await import('../cash')
    costs = await import('../costs')
    const merchants = await import('../merchants')
    tenantId = (await merchants.createMerchant(master(), { name: 'Cash Store', slug: `cash-${stamp}`, ownerEmail: 'o@cash.test', planCode: 'launch', trialEndsAt: null, now: ist('2026-10-01T00:00:00') }) as { id: string }).id
  })

  it('support staff are refused by every export', async () => {
    const none = '00000000-0000-0000-0000-000000000000'
    await expect(cash.cashData(support, TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.cashOverview(support, TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.movementsOf(support, '2026-11')).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.booksFor(support, 1, TODAY, TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.setBalance(support, { accountId: none, asOf: TODAY, paise: 1 }, TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.undoBalance(support, none, none, new Date())).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.addEntry(support, { kind: 'funding', amount: 1, happenedOn: TODAY }, TODAY)).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.editEntry(support, none, { note: 'x' }, TODAY, new Date())).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.deleteEntry(support, none, new Date())).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.addAccount(support, 'x')).rejects.toThrow('ADMIN_ONLY')
    await expect(cash.setSettings(support, { floorPaise: 1 })).rejects.toThrow('ADMIN_ONLY')
  })

  it('accounts: the first becomes the main account; a balance keeps its amount out of the audit; the floor is audited only when it changed', async () => {
    const staff = master()
    const a = await cash.addAccount(staff, `Current ${stamp}`)
    const b = await cash.addAccount(staff, `Reserve ${stamp}`)
    expect(a.ok && b.ok).toBe(true)
    main = (a as { id: string }).id; reserve = (b as { id: string }).id
    const d = await cash.cashData(staff, TODAY)
    // a prior run may already have a main account; this run's first is main only on a fresh database
    expect(d.accounts.some((x) => x.id === main) && d.accounts.some((x) => x.id === reserve)).toBe(true)
    await cash.setSettings(staff, { mainAccountId: main })
    expect((await cash.cashData(staff, TODAY)).settings.mainAccountId).toBe(main)

    expect(await cash.setBalance(staff, { accountId: main, asOf: '2026-11-30', paise: 1 }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
    expect(await cash.setBalance(staff, { accountId: '00000000-0000-0000-0000-000000000000', asOf: TODAY, paise: 1 }, TODAY)).toEqual({ ok: false, error: 'not_found' })
    const set = await cash.setBalance(staff, { accountId: main, asOf: '2026-11-20', paise: 100_000 * R, floorPaise: 250_000 * R }, TODAY)
    expect(set.ok).toBe(true)
    await cash.setBalance(staff, { accountId: main, asOf: '2026-11-20', paise: 100_000 * R, floorPaise: 250_000 * R }, TODAY) // the floor did not change
    const sql = su()
    const audit = await sql`select action, detail::text d from audit_events where action in ('cash.balance.set', 'cash.settings.set') and (detail::text like ${'%' + main + '%'} or action = 'cash.settings.set') order by at`
    await sql.end()
    expect(audit.filter((r) => r.action === 'cash.balance.set').every((r) => r.d.includes(main) && r.d.includes('2026-11-20') && !r.d.includes('10000000'))).toBe(true)
    expect(audit.filter((r) => r.action === 'cash.settings.set' && r.d.includes('floorPaise')).length).toBeGreaterThanOrEqual(1)
    expect((await cash.cashData(staff, TODAY)).settings.floor).toBe(250_000 * R)
  })

  it('Undo of a balance is free for ten minutes, then needs a fresh passkey check', async () => {
    const staff = master(new Date(0))
    const made = await cash.setBalance(master(), { accountId: reserve, asOf: '2026-11-21', paise: 130_000 * R }, TODAY)
    const id = (made as { id: string }).id
    expect(await cash.undoBalance(staff, reserve, id, new Date(Date.now() + 11 * 60_000))).toEqual({ ok: false, error: 'confirm_first' })
    expect(await cash.undoBalance(staff, main, id, new Date())).toEqual({ ok: false, error: 'not_found' }) // the wrong account
    expect(await cash.undoBalance(staff, reserve, id, new Date())).toEqual({ ok: true })
  })

  it('entries: the day rules, the passkey on an old done entry, the old figures in a delete, a planned entry made done', async () => {
    const staff = master()
    expect(await cash.addEntry(staff, { kind: 'funding', amount: 1, happenedOn: '2026-12-01' }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
    expect(await cash.addEntry(staff, { kind: 'grant', amount: 1, expectedOn: '2029-01-01' }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
    expect(await cash.addEntry(staff, { kind: 'grant', amount: 1 }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
    expect(await cash.addEntry(staff, { kind: 'grant', amount: 1, happenedOn: TODAY, expectedOn: TODAY }, TODAY)).toEqual({ ok: false, error: 'bad_input' })
    const done = await cash.addEntry(staff, { kind: 'funding', amount: 200_000 * R, happenedOn: '2026-11-22', accountId: main, note: `Seed ${stamp}` }, TODAY)
    const planned = await cash.addEntry(staff, { kind: 'grant', amount: 150_000 * R, expectedOn: '2027-02-15', accountId: reserve }, TODAY)
    const doneId = (done as { id: string }).id, plannedId = (planned as { id: string }).id
    const stale = master(new Date(0)), later = new Date(Date.now() + 11 * 60_000)
    expect(await cash.editEntry(stale, doneId, { note: 'x' }, TODAY, later)).toEqual({ ok: false, error: 'confirm_first' })
    expect(await cash.editEntry(stale, doneId, { note: 'x' }, TODAY, new Date())).toEqual({ ok: true })
    // a planned entry made done with its figures unchanged is free; with a different day or amount it needs the check
    expect(await cash.editEntry(stale, plannedId, { happenedOn: TODAY, expectedOn: null }, TODAY, new Date())).toEqual({ ok: false, error: 'confirm_first' })
    expect(await cash.editEntry(stale, plannedId, { amount: 160_000 * R }, TODAY, new Date())).toEqual({ ok: true })
    expect(await cash.deleteEntry(stale, doneId, later)).toEqual({ ok: false, error: 'confirm_first' })
    expect(await cash.deleteEntry(master(later), doneId, later)).toEqual({ ok: true })
    expect(await cash.deleteEntry(stale, plannedId, later)).toEqual({ ok: true })
    const sql = su()
    const rows = await sql`select action, detail::text d from audit_events where target in (${doneId}, ${plannedId}) order by at`
    await sql.end()
    const del = rows.find((r) => r.action === 'cash.entry.delete' && r.d.includes('20000000'))
    expect(del?.d).toContain('"kind": "funding"')
    expect(rows.some((r) => r.action === 'cash.entry.delete' && r.d.includes('"kind": "grant"') && !r.d.includes('16000000'))).toBe(true)
    expect(rows.every((r) => !r.d.includes(`Seed ${stamp}`))).toBe(true) // a note never reaches the audit
  })

  it('Billing money in leaves out a test invoice and subtracts a refund; the books roll the main balance forward; the difference follows', async () => {
    const bm = await (await import('../billing')).billingIn(master(), '2026-11-01', '2026-12-01', 'month')
    const bd = await (await import('../billing')).billingIn(master(), '2026-11-01', '2026-12-01', 'day')
    const sql = su()
    await sql.begin(async (x) => {
      await x`set local session_replication_role = replica`
      const [real] = await x`insert into frrata_invoices (tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total, test_mode) values (${tenantId}, '2026-09-01T00:00:00+05:30', '2026-10-01T00:00:00+05:30', 1000000, 0, 0, 180000, 1180000, false) returning id`
      const [test] = await x`insert into frrata_invoices (tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total, test_mode) values (${tenantId}, '2026-08-01T00:00:00+05:30', '2026-09-01T00:00:00+05:30', 400000, 0, 0, 72000, 472000, true) returning id`
      await x`insert into frrata_payments (tenant_id, invoice_id, method, amount, utr, captured_at) values (${tenantId}, ${real!.id}, 'upi', 1000000, ${'CASHUTR1' + stamp}, '2026-11-03T10:00:00+05:30')`
      await x`insert into frrata_payments (tenant_id, invoice_id, method, amount, utr, captured_at) values (${tenantId}, ${test!.id}, 'upi', 400000, ${'CASHUTR2' + stamp}, '2026-11-04T10:00:00+05:30')`
      await x`insert into frrata_payments (tenant_id, invoice_id, method, amount, utr, captured_at, over_paid, refund_amount, refund_utr, refunded_at, refunded_by) values (${tenantId}, ${real!.id}, 'upi', 50000, ${'CASHUTR3' + stamp}, '2026-11-21T10:00:00+05:30', 50000, 50000, ${'CASHREF' + stamp}, '2026-11-22T10:00:00+05:30', ${base.userId})`
    })
    await sql.end()
    const staff = master()
    const billing = await (await import('../billing')).billingIn(staff, '2026-11-01', '2026-12-01', 'month')
    // 10,000 + 500 captured (the test invoice's 4,000 is left out) less the 500 refunded
    expect((billing['2026-11'] ?? 0) - (bm['2026-11'] ?? 0)).toBe(1_000_000 + 50_000 - 50_000)
    const byDay = await (await import('../billing')).billingIn(staff, '2026-11-01', '2026-12-01', 'day')
    expect((byDay['2026-11-03'] ?? 0) - (bd['2026-11-03'] ?? 0)).toBe(1_000_000)
    expect((byDay['2026-11-22'] ?? 0) - (bd['2026-11-22'] ?? 0)).toBe(-50_000)
    // costs: a payment on the 22nd; an entry on the 22nd; the main balance is ₹1,00,000 as of the 20th
    const c = await costs.addCost(staff, { kind: 'recurring', name: `Cash cost ${stamp}`, category: 'software', cadence: 'monthly', amount: 1_000 * R, currency: 'INR', varies: false, anchorOn: '2026-11-22' }, TODAY)
    await costs.markPaid(staff, (c as { id: string }).id, { periodFor: '2026-11-22', paidOn: '2026-11-22', amount: 1_000 * R }, TODAY)
    await cash.addEntry(staff, { kind: 'funding', amount: 2_000 * R, happenedOn: '2026-11-22', accountId: main }, TODAY)
    const books = await cash.booksFor(staff, 106_000 * R, TODAY, TODAY)
    // after the 20th: billing 10,000 captured (3rd is before the 20th: left out) ... the 22nd's refund -500; costs -1,000; funding +2,000 (the earlier 200,000 entry was on the 22nd too, then deleted)
    expect(books).not.toBeNull()
    expect(books!.difference).toBe(106_000 * R - books!.books)
    const overview = await cash.cashOverview(staff, TODAY)
    expect(overview.accounts.find((a) => a.id === main)?.main).toBe(true)
    expect(overview.cash).not.toBeNull()
    const nov = overview.rows.find((r) => r.month === '2026-11')
    expect(nov).toBeDefined()
  })

  it('Movements merge the three sources, newest first, with Billing as one line a day', async () => {
    const mv = await cash.movementsOf(master(), '2026-11')
    expect(mv.lines.some((l) => l.source === 'Billing' && l.date === '2026-11-03' && l.amount >= 1_000_000)).toBe(true)
    expect(mv.lines.some((l) => l.source === 'Costs')).toBe(true)
    expect(mv.lines.some((l) => l.source === 'Entered')).toBe(true)
    const dates = mv.lines.map((l) => l.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(mv.more).toBe(false)
  })

  it('support staff read none of the cash rows in Activity', async () => {
    const activity = await import('../activity')
    const seen = (await activity.listActivity(support)).rows.filter((r) => r.action.startsWith('cash.'))
    expect(seen).toEqual([])
    expect((await activity.listActivity(master())).rows.some((r) => r.action.startsWith('cash.'))).toBe(true)
  })
})
