import { describe, expect, it } from 'vitest'
import { offerStatus } from '../offer-status'
import { parseOffer, toIst, type OfferValues } from '../offer-form'

const base: OfferValues = { title: 'Diwali', style: 'order_off', kind: 'percent', value: '15', cap: '', min: '2999', code: 'diwali15', startsAt: '2026-11-15T00:00', endsAt: '2026-11-30T23:59',
  limitTotal: '', limitPerPhone: '1', budget: '40000', listed: true, combinesWithPayment: true, announce: false }

describe('parseOffer', () => {
  it('turns rupees into paise, % into bps, IST into instants, the code upper-cased', () => {
    const r = parseOffer(base)
    expect(r.ok && r.patch).toMatchObject({ percentBps: 1500, amountOff: null, minSubtotal: 299900, code: 'DIWALI15', limitPerPhone: 1, limitTotal: null, budget: 4_000_000 })
    expect(r.ok && r.patch.startsAt.toISOString()).toBe('2026-11-14T18:30:00.000Z')
    expect(toIst(new Date('2026-11-14T18:30:00.000Z'))).toBe('2026-11-15T00:00')
  })
  it('says what is wrong, field by field', () => {
    const r = parseOffer({ ...base, title: '', value: '120', code: 'a b', endsAt: '2026-11-01T00:00', limitTotal: '0' })
    expect(r.ok ? {} : Object.keys(r.errors).sort()).toEqual(['code', 'endsAt', 'limitTotal', 'title', 'value'])
  })
  it('free shipping takes no value; an offer without a code is always listed', () => {
    const r = parseOffer({ ...base, style: 'free_shipping', value: '', code: '', listed: false })
    expect(r.ok && r.patch).toMatchObject({ percentBps: null, amountOff: null, cap: null, listed: true })
  })
})

describe('offerStatus', () => {
  const now = new Date('2026-11-20T10:00:00Z')
  const d = { startedAt: new Date('2026-11-10T00:00:00Z'), pausedAt: null, endedAt: null, startsAt: new Date('2026-11-15T00:00:00Z'), endsAt: new Date('2026-11-30T00:00:00Z') }
  it('draft, scheduled, live, paused, ended — ended beats everything', () => {
    expect(offerStatus({ ...d, startedAt: null }, now)).toBe('draft')
    expect(offerStatus({ ...d, startsAt: new Date('2026-11-21T00:00:00Z') }, now)).toBe('scheduled')
    expect(offerStatus(d, now)).toBe('live')
    expect(offerStatus({ ...d, pausedAt: now }, now)).toBe('paused')
    expect(offerStatus({ ...d, endsAt: now }, now)).toBe('ended')
    expect(offerStatus({ ...d, startedAt: null, endedAt: now }, now)).toBe('ended')
  })
})

describe('offer text: one wording everywhere', () => {
  it('terms, and the bar with a listed code and a real end', async () => {
    const { offerTerms, barText } = await import('../offer-text')
    const o = { title: 'Diwali', style: 'order_off', percentBps: 1500, amountOff: null, cap: 50000, minSubtotal: 299900 }
    expect(offerTerms(o)).toBe('15% off (up to ₹500) above ₹2,999')
    expect(barText(o, { code: 'DIWALI15', endsAt: new Date('2026-11-30T18:00:00Z') })).toBe('Diwali · 15% off above ₹2,999 · code DIWALI15 · till 30 Nov')
    expect(barText({ ...o, style: 'pay_online', percentBps: null, amountOff: 5000, minSubtotal: 0 }, { code: null, endsAt: null })).toBe('Pay online, save ₹50')
    expect(offerTerms({ ...o, style: 'free_shipping', percentBps: null, minSubtotal: 99900 })).toBe('Free shipping above ₹999')
  })
  it('an unlisted code offer cannot go in the bar (shoppers would read an offer they cannot get)', async () => {
    const { parseOffer } = await import('../offer-form')
    const r = parseOffer({ title: 'Friends', style: 'order_off', kind: 'percent', value: '20', cap: '', min: '', code: 'FRIENDS20', startsAt: '2026-11-15T00:00', endsAt: '',
      limitTotal: '', limitPerPhone: '', budget: '', listed: false, combinesWithPayment: true, announce: true })
    expect(r.ok ? null : r.errors.announce).toMatch(/bar/)
  })
})

describe('O·2 wording and form', () => {
  it('reads each new style the same way everywhere', async () => {
    const { offerTerms, barText } = await import('../offer-text')
    const base = { title: 'Basics', percentBps: null, amountOff: null, minSubtotal: 0 }
    expect(offerTerms({ ...base, style: 'bxgy', buyQty: 2, getQty: 1, getBps: 10000, targets: 'collections' })).toBe('Buy 2, get 1 free on chosen products')
    expect(offerTerms({ ...base, style: 'free_gift', minSubtotal: 299900 })).toBe('Free gift above ₹2,999')
    expect(offerTerms({ ...base, style: 'order_off', tiers: [{ min: 199900, percentBps: 1000, amountOff: null }, { min: 299900, percentBps: 1500, amountOff: null }] })).toBe('10% off above ₹1,999 · 15% off above ₹2,999')
    expect(barText({ ...base, style: 'order_off', amountOff: 10000, firstOrder: true }, { code: null, endsAt: null })).toBe('Basics · ₹100 off · first order')
  })
  it('parses Buy X get Y, a gift, targets and tiers; says what is missing', async () => {
    const { parseOffer } = await import('../offer-form')
    const v = { title: 'X', style: 'bxgy', kind: 'percent', value: '', cap: '', min: '', code: '', startsAt: '2026-11-15T00:00', endsAt: '', limitTotal: '', limitPerPhone: '', budget: '',
      listed: true, combinesWithPayment: true, announce: false, buyQty: '2', getQty: '1', getPct: '100', targets: 'all' }
    expect(parseOffer(v).ok && (parseOffer(v) as { patch: { getBps: number } }).patch.getBps).toBe(10000)
    const bad = parseOffer({ ...v, getQty: '0', targets: 'products', targetIds: [] })
    expect(bad.ok ? [] : Object.keys(bad.errors).sort()).toEqual(['getQty', 'targets'])
    const tiered = parseOffer({ ...v, style: 'order_off', tiers: [{ min: '2999', value: '15' }, { min: '1999', value: '10' }] })
    expect(tiered.ok && tiered.patch.tiers).toEqual([{ min: 199900, percentBps: 1000, amountOff: null }, { min: 299900, percentBps: 1500, amountOff: null }])
    expect(parseOffer({ ...v, style: 'free_gift' }).ok).toBe(false)
  })
})
