import { describe, expect, it } from 'vitest'
import { parseAdd, parseEdit, parseEnd, parseIds, parsePaid } from '../input'

const TODAY = '2026-11-23'
const ID = '00000000-0000-4000-8000-0000000000c1'

describe('parseAdd', () => {
  const recurring = { kind: 'recurring', name: '  Vercel  Pro ', vendor: ' ', category: 'infrastructure', currency: 'USD', cadence: 'monthly', amount: '20.00', anchorOn: '2026-11-26', varies: 'on' }
  it('a repeating cost: clean name, empty vendor is null, dollars to micro-dollars', () => {
    expect(parseAdd(recurring, TODAY)).toEqual({ ok: true, data: expect.objectContaining({ kind: 'recurring', name: 'Vercel Pro', vendor: null, amount: 20_000_000, cadence: 'monthly', varies: true, anchorOn: '2026-11-26' }) })
  })
  it('names each wrong field in words', () => {
    expect(parseAdd({ ...recurring, name: '   ' }, TODAY)).toEqual({ ok: false, fields: { name: 'Add a name.' } })
    expect(parseAdd({ ...recurring, amount: '0', anchorOn: '2026-02-30' }, TODAY)).toEqual({ ok: false, fields: { amount: 'Enter an amount above zero.', anchorOn: 'Pick the next due date.' } })
  })
  it('a repeating cost needs its cadence and a date no more than two years out', () => {
    expect(parseAdd({ ...recurring, cadence: '' }, TODAY).ok).toBe(false)
    expect(parseAdd({ ...recurring, anchorOn: '2029-01-01' }, TODAY).ok).toBe(false)
  })
  it('a one-time cost needs a paid day that has passed, and rupees for a dollar bill', () => {
    const once = { kind: 'one_time', name: 'Logo', category: 'design', currency: 'INR', amount: '25,000', paidOn: '2026-11-09', gst: '3813.56' }
    expect(parseAdd(once, TODAY)).toEqual({ ok: true, data: expect.objectContaining({ kind: 'one_time', amount: 2_500_000, gstPaise: 381_356, paidOn: '2026-11-09' }) })
    expect(parseAdd({ ...once, paidOn: '2026-12-01' }, TODAY).ok).toBe(false)
    expect(parseAdd({ ...once, currency: 'USD', amount: '100' }, TODAY)).toMatchObject({ ok: false, fields: { inr: expect.any(String) } })
  })
  it('refuses an unknown category, kind or currency, and text over its cap', () => {
    expect(parseAdd({ ...recurring, category: 'snacks' }, TODAY).ok).toBe(false)
    expect(parseAdd({ ...recurring, kind: 'weekly' }, TODAY).ok).toBe(false)
    expect(parseAdd({ ...recurring, currency: 'EUR' }, TODAY).ok).toBe(false)
    expect(parseAdd({ ...recurring, name: 'x'.repeat(81) }, TODAY).ok).toBe(false)
    expect(parseAdd({ ...recurring, note: 'x'.repeat(301) }, TODAY).ok).toBe(false)
  })
})

describe('parsePaid', () => {
  const paid = { itemId: ID, periodFor: '2026-11-26', paidOn: '2026-11-23', currency: 'USD', amount: '20', inr: '1,884' }
  it('exact money in both currencies', () => {
    expect(parsePaid(paid, TODAY)).toEqual({ ok: true, data: { itemId: ID, currency: 'USD', input: expect.objectContaining({ amount: 20_000_000, inrPaise: 188_400, periodFor: '2026-11-26' }) } })
  })
  it('a dollar bill needs its rupees, a paid day in the future is refused, a bad id is refused', () => {
    expect(parsePaid({ ...paid, inr: '' }, TODAY)).toMatchObject({ ok: false, fields: { inr: expect.any(String) } })
    expect(parsePaid({ ...paid, paidOn: '2026-11-30' }, TODAY)).toMatchObject({ ok: false, fields: { paidOn: expect.any(String) } })
    expect(parsePaid({ ...paid, itemId: 'nope' }, TODAY).ok).toBe(false)
  })
})

describe('the small ones', () => {
  it('ids, end and edit', () => {
    expect(parseIds({ itemId: ID, paymentId: ID }).ok).toBe(true)
    expect(parseIds({ itemId: ID, paymentId: 'x' }).ok).toBe(false)
    expect(parseEnd({ itemId: ID, endsOn: '2026-12-31' }, TODAY)).toEqual({ ok: true, data: { itemId: ID, endsOn: '2026-12-31' } })
    expect(parseEnd({ itemId: ID, endsOn: 'soon' }, TODAY).ok).toBe(false)
    expect(parseEdit({ itemId: ID, name: 'New name', varies: 'off' }, TODAY)).toEqual({ ok: true, data: { itemId: ID, patch: { name: 'New name', varies: false } } })
    expect(parseEdit({ itemId: ID, amount: '5' }, TODAY).ok).toBe(false) // an amount needs its currency
    expect(parseEdit({ itemId: ID, amount: '5', currency: 'INR' }, TODAY)).toEqual({ ok: true, data: { itemId: ID, patch: { amount: 500, currency: 'INR' } } })
    expect(parseEdit({ itemId: ID, name: ' ' }, TODAY).ok).toBe(false)
  })
})
