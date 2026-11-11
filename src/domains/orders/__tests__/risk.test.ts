import { describe, expect, it } from 'vitest'
import { risk, type RiskFacts } from '../risk'

const ok: RiskFacts = {
  cod: true, total: 249000, customerName: 'Ananya Sharma', addressLine: 'B-14, Tilak Marg', city: 'Jaipur', pincodeCity: 'Jaipur',
  sameItemsWithin24h: 0, codFromPhoneToday: 1, cancelledAsFake: 0, cameBack: 0, earlierOrders: 2, medianCod: 200000,
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
    // Shop stress test 2026-11-11: a phone whose parcels came back is never Low, whatever the address looks like.
    expect(risk({ ...ok, cameBack: 1 })).toMatchObject({ level: 'high', reasons: ['An earlier parcel to this phone came back'] })
    expect(risk({ ...ok, cameBack: 2 }).reasons).toEqual(['2 earlier parcels to this phone came back'])
    expect(risk({ ...ok, cod: false, cameBack: 2 }).level).toBe('low')
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
  it('a genuine address typed in Hindi is not risky for its script (shop stress test 2026-11-11)', () => {
    const hindi = { ...ok, earlierOrders: 0, addressLine: 'मकान नं. १२, गांधी नगर रोड', city: 'जयपुर', pincodeCity: 'Jaipur' }
    // A first order with a numbered Hindi address and a Hindi city: one reason (first order) is never Medium.
    expect(risk(hindi)).toMatchObject({ level: 'low' })
    // Without a number in any script it is still flagged, as in English.
    expect(risk({ ...hindi, addressLine: 'गांधी नगर रोड के पास वाली गली' }).reasons).toContain('The address has no house or building number, or is very short')
    // A Latin city that differs from the pincode's still counts.
    expect(risk({ ...hindi, city: 'Jodhpur', addressLine: 'गांधी नगर रोड के पास वाली गली' }).reasons).toContain("The city typed is not the pincode's city (Jaipur)")
    // Any script's digits are a number (Bengali ১২, Gujarati ૧૨); a Latin city with a comma or a digit is still compared.
    expect(risk({ ...hindi, addressLine: 'বাড়ি ১২, গান্ধী রোড, পার্ক স্ট্রিট' }).reasons).not.toContain('The address has no house or building number, or is very short')
    expect(risk({ ...hindi, addressLine: 'ઘર ૧૨, ગાંધી રોડ પાસે, નવરંગપુરા' }).reasons).not.toContain('The address has no house or building number, or is very short')
    expect(risk({ ...hindi, city: 'Jodhpur, Raj', addressLine: 'गांधी नगर रोड के पास वाली गली' }).reasons).toContain("The city typed is not the pincode's city (Jaipur)")
  })
})
