import { describe, expect, it } from 'vitest'
import { parseAccountName, parseBalanceForm, parseBooksAsk, parseEntryEdit, parseEntryForm, parseId, parseIds } from '../input'

const TODAY = '2026-11-23'
const ID = '00000000-0000-4000-8000-0000000000c1'

describe('parseBalanceForm', () => {
  const form = { accountId: ID, asOf: '2026-11-22', balance: '2,95,000' }
  it('a balance is signed paise; a minus means overdrawn; the note is cleaned; no floor field leaves the floor alone', () => {
    expect(parseBalanceForm(form, TODAY)).toEqual({ ok: true, data: { accountId: ID, asOf: '2026-11-22', paise: 29_500_000, note: null } })
    expect(parseBalanceForm({ ...form, balance: '-17,400.50', note: '  Statement   ' }, TODAY)).toEqual({ ok: true, data: { accountId: ID, asOf: '2026-11-22', paise: -1_740_050, note: 'Statement' } })
  })
  it('the floor: a figure sets it, empty clears it, zero is allowed, a negative is refused', () => {
    expect(parseBalanceForm({ ...form, floor: '2,50,000' }, TODAY)).toMatchObject({ ok: true, data: { floorPaise: 25_000_000 } })
    expect(parseBalanceForm({ ...form, floor: '' }, TODAY)).toMatchObject({ ok: true, data: { floorPaise: null } })
    expect(parseBalanceForm({ ...form, floor: '0' }, TODAY)).toMatchObject({ ok: true, data: { floorPaise: 0 } })
    expect(parseBalanceForm({ ...form, floor: '-5' }, TODAY)).toEqual({ ok: false, fields: { floor: 'Enter the floor in rupees.' } })
  })
  it('names each wrong field: a future day, a word for a balance, an unknown account', () => {
    expect(parseBalanceForm({ ...form, asOf: '2026-11-30', balance: 'lots' }, TODAY)).toEqual({ ok: false, fields: { asOf: 'Pick today or an earlier day.', balance: 'Enter the balance. A minus sign means overdrawn.' } })
    expect(parseBalanceForm({ ...form, accountId: 'x' }, TODAY).ok).toBe(false)
    expect(parseBalanceForm({ ...form, asOf: '2026-02-30' }, TODAY).ok).toBe(false)
  })
})

describe('parseEntryForm', () => {
  const form = { kind: 'funding', amount: '5,00,000', date: '2026-07-14', accountId: ID }
  it('a done entry has a day that has passed; a planned one up to two years ahead', () => {
    expect(parseEntryForm(form, TODAY)).toEqual({ ok: true, data: { kind: 'funding', amount: 50_000_000, happenedOn: '2026-07-14', accountId: ID, note: null } })
    expect(parseEntryForm({ ...form, planned: 'on', date: '2027-02-15' }, TODAY)).toMatchObject({ ok: true, data: { expectedOn: '2027-02-15' } })
    expect(parseEntryForm({ ...form, date: '2026-12-01' }, TODAY)).toEqual({ ok: false, fields: { happenedOn: 'Pick today or an earlier day.' } })
    expect(parseEntryForm({ ...form, planned: 'on', date: '2029-01-01' }, TODAY)).toEqual({ ok: false, fields: { expectedOn: 'Pick a day up to two years ahead.' } })
  })
  it('an amount above zero, a known kind, a valid account id', () => {
    expect(parseEntryForm({ ...form, amount: '0' }, TODAY)).toEqual({ ok: false, fields: { amount: 'Enter an amount above ₹0.' } })
    expect(parseEntryForm({ ...form, kind: 'salary' }, TODAY).ok).toBe(false)
    expect(parseEntryForm({ ...form, accountId: 'nope' }, TODAY)).toEqual({ ok: false, fields: { accountId: 'Pick an account.' } })
    expect(parseEntryForm({ ...form, accountId: '' }, TODAY)).toMatchObject({ ok: true, data: { accountId: null } })
  })
})

describe('the small ones', () => {
  it('an edit carries only what changed; empty clears a day, an account or a note', () => {
    expect(parseEntryEdit({ id: ID, amount: '1,000', happenedOn: '2026-11-20', expectedOn: '' }, TODAY)).toEqual({ ok: true, data: { id: ID, patch: { amount: 100_000, happenedOn: '2026-11-20', expectedOn: null } } })
    expect(parseEntryEdit({ id: ID, note: '' }, TODAY)).toEqual({ ok: true, data: { id: ID, patch: { note: null } } })
    expect(parseEntryEdit({ id: ID, amount: '0' }, TODAY).ok).toBe(false)
  })
  it('ids, an account name and the books ask', () => {
    expect(parseIds({ accountId: ID, balanceId: ID }).ok).toBe(true)
    expect(parseIds({ accountId: ID, balanceId: 'x' }).ok).toBe(false)
    expect(parseId({ id: ID }).ok).toBe(true)
    expect(parseAccountName({ name: '  Current   account ' })).toEqual({ ok: true, data: { name: 'Current account' } })
    expect(parseAccountName({ name: '   ' }).ok).toBe(false)
    expect(parseAccountName({ name: 'x'.repeat(61) }).ok).toBe(false)
    expect(parseBooksAsk({ balance: '1,75,000', asOf: '2026-11-23' }, TODAY)).toEqual({ ok: true, data: { typed: 17_500_000, asOf: '2026-11-23' } })
    expect(parseBooksAsk({ balance: 'x', asOf: '2026-11-23' }, TODAY).ok).toBe(false)
  })
})
