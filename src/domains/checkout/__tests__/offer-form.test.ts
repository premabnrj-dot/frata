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
