import { describe, expect, it } from 'vitest'
import { risk, type RiskFacts } from '../risk'

const ok: RiskFacts = {
  cod: true, total: 249000, customerName: 'Ananya Sharma', addressLine: 'B-14, Tilak Marg', city: 'Jaipur', pincodeCity: 'Jaipur',
  sameItemsWithin24h: 0, codFromPhoneToday: 1, cancelledAsFake: 0, earlierOrders: 2, medianCod: 200000,
}

describe('COD risk', () => {
  it('an ordinary repeat customer: low, nothing shown', () => {
    expect(risk(ok)).toEqual({ level: 'low', reasons: [], next: null })
  })
  it('paid online: no risk to show, whatever the facts', () => {
    expect(risk({ ...ok, cod: false, cancelledAsFake: 3 }).level).toBe('low')
  })
  it('high on any one of: a duplicate, 3+ COD today, an earlier fake — with the next step', () => {
    expect(risk({ ...ok, sameItemsWithin24h: 1 })).toMatchObject({ level: 'high', next: 'Call before confirming. Cancel if unreachable.' })
    expect(risk({ ...ok, codFromPhoneToday: 3 }).reasons).toEqual(['3 pay-on-delivery orders from this phone today'])
    expect(risk({ ...ok, cancelledAsFake: 1 }).level).toBe('high')
    expect(risk({ ...ok, codFromPhoneToday: 2 }).level).toBe('low')
  })
  it('medium only on two or more signals; one alone is not enough', () => {
    expect(risk({ ...ok, earlierOrders: 0 }).level).toBe('low')
    expect(risk({ ...ok, earlierOrders: 0, addressLine: 'near temple' })).toMatchObject({ level: 'medium', next: 'Call or WhatsApp to confirm.' })
    expect(risk({ ...ok, earlierOrders: 0, total: 500000 }).reasons).toContain('Over twice your usual pay-on-delivery order')
    expect(risk({ ...ok, earlierOrders: 0, customerName: 'test' }).level).toBe('medium')
  })
  it('the city check is off when the pincode is not in the directory; case and spaces do not count', () => {
    expect(risk({ ...ok, earlierOrders: 0, city: 'Jodhpur', pincodeCity: null }).level).toBe('low')
    expect(risk({ ...ok, earlierOrders: 0, city: 'Jodhpur' }).level).toBe('medium')
    expect(risk({ ...ok, earlierOrders: 0, city: ' jaipur ' }).level).toBe('low')
  })
  it('the median rule is off until the shop has enough orders', () => {
    expect(risk({ ...ok, earlierOrders: 0, total: 900000, medianCod: null }).level).toBe('low')
  })
  it('never more than three reasons', () => {
    const r = risk({ ...ok, earlierOrders: 0, addressLine: 'x', city: 'Pune', total: 900000, customerName: 'abc' })
    expect(r.reasons.length).toBe(3)
  })
})
