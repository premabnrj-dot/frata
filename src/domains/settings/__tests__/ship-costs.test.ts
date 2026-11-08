import { describe, expect, it } from 'vitest'
import { estimateOf, parseShipCosts } from '../ship-costs'

describe('shipping costs', () => {
  it('takes whole rupees as typed, in paise', () => {
    expect(parseShipCosts({ delivery: '70', ret: ' ₹1,200 ', cod: '0' })).toEqual({ ok: true, paise: { delivery: 7000, ret: 120000, cod: 0 } })
    expect(parseShipCosts({ delivery: '10000', ret: '1', cod: '36' })).toMatchObject({ ok: true })
  })
  it('refuses blank, decimals, over ₹10,000 and anything not a string, field by field', () => {
    const r = parseShipCosts({ delivery: '', ret: '70.5', cod: '10001' })
    expect(r.ok).toBe(false)
    expect(Object.keys(!r.ok ? r.errors : {})).toEqual(['delivery', 'ret', 'cod'])
    expect(parseShipCosts({ delivery: 70, ret: '70', cod: '36' })).toMatchObject({ ok: false, errors: { delivery: expect.any(String) } })
    expect(parseShipCosts(null)).toMatchObject({ ok: false })
  })
  it('counts only when all three are set and confirmed', () => {
    const at = new Date('2026-11-08T10:00:00Z')
    expect(estimateOf({ delivery: 7000, ret: 7000, cod: 3600, confirmedAt: at })).toEqual({ delivery: 7000, ret: 7000, codFee: 3600 })
    expect(estimateOf({ delivery: 7000, ret: 7000, cod: 3600, confirmedAt: null })).toBe(null)
    expect(estimateOf({ delivery: 7000, ret: null, cod: 3600, confirmedAt: at })).toBe(null)
    expect(estimateOf(null)).toBe(null)
  })
})
