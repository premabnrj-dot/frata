import { describe, expect, it } from 'vitest'
import { inPreset, PRESET_PREFIXES } from '../presets'
import { chargeOn, resolveDelivery, zoneFor, type Floor, type Zone, type ZoneSetup } from '../resolve'

const floor: Floor = { shippingFlat: 7900, freeShippingAbove: 199900, codOn: true, codMin: 0, codMax: 0, codCharge: 4900, codBlockedPincodes: ['110094'], dispatchDays: 1, metroDays: 2, restDays: 5 }
const z = (id: string, position: number, preset: Zone['preset'], over: Partial<Zone> = {}): Zone =>
  ({ id, name: id, position, preset, charge: 7900, freeAbove: 199900, daysMin: 3, daysMax: 5, codOn: true, codFee: 4900, codMin: 0, codMax: null, ...over })
const zones = [
  z('Metro', 0, 'metro', { charge: 5900, freeAbove: 149900, daysMin: 2, daysMax: 3 }),
  z('Tier 2', 1, 'tier2'),
  z('Rest of India', 2, 'rest', { charge: 9900, daysMin: 4, daysMax: 7, codFee: 6900, codMax: 300000 }),
  z('Special', 3, 'special', { charge: 14900, freeAbove: null, daysMin: 6, daysMax: 10, codOn: false }),
  z('Jaipur same city', 4, null, { charge: 3900, freeAbove: 99900, daysMin: 1, daysMax: 2, codFee: 0 }),
]
const setup = (over: Partial<ZoneSetup> = {}): ZoneSetup => ({ zones, ownZoneIds: [], rule: null, ...over })

describe('presets by prefix', () => {
  it('metros, tier 2, special, and Lakshadweep apart from Kochi', () => {
    expect(inPreset('metro', '110001')).toBe(true)
    expect(inPreset('metro', '400070')).toBe(true)
    expect(inPreset('metro', '302012')).toBe(false)
    expect(inPreset('tier2', '302012')).toBe(true) // Jaipur
    expect(inPreset('special', '799001')).toBe(true) // Agartala
    expect(inPreset('special', '737101')).toBe(true) // Gangtok
    expect(inPreset('special', '744101')).toBe(true) // Port Blair
    expect(inPreset('special', '682555')).toBe(true) // Lakshadweep
    expect(inPreset('tier2', '682555')).toBe(false)
    expect(inPreset('tier2', '682001')).toBe(true) // Kochi
    expect(inPreset('rest', '845401')).toBe(true)
  })
  it('lists are 3-digit prefixes with no metro also in tier 2', () => {
    for (const list of Object.values(PRESET_PREFIXES)) for (const p of list) expect(p).toMatch(/^[1-9][0-9]{2}$/)
    expect(PRESET_PREFIXES.metro.filter((p) => (PRESET_PREFIXES.tier2 as readonly string[]).includes(p))).toEqual([])
  })
})

describe('resolveDelivery: the floor (no app) answers exactly as today', () => {
  it('one charge, free-above, COD with its fee and limits, metro…rest days', () => {
    expect(resolveDelivery('302012', floor, null)).toEqual({ deliverable: true, zone: null, charge: 7900, freeAbove: 199900, cod: { on: true, fee: 4900, min: 0, max: null }, days: [2, 5] })
  })
  it('the no-COD list; COD off; no PIN code yet', () => {
    expect(resolveDelivery('110094', floor, null).cod).toEqual({ on: false, why: 'blocked_pincode' })
    expect(resolveDelivery('302012', { ...floor, codOn: false }, null).cod).toEqual({ on: false, why: 'off' })
    expect(resolveDelivery(null, floor, setup()).zone).toBeNull() // the buy box with no PIN code: the shop's default
  })
})

describe('resolveDelivery: zones', () => {
  it('a preset zone by prefix; a metro beats tier 2; rest catches the rest; special', () => {
    expect(resolveDelivery('400070', floor, setup())).toMatchObject({ zone: 'Metro', charge: 5900, freeAbove: 149900, days: [2, 3] })
    expect(resolveDelivery('302012', floor, setup())).toMatchObject({ zone: 'Tier 2' })
    expect(resolveDelivery('845401', floor, setup())).toMatchObject({ zone: 'Rest of India', charge: 9900, cod: { on: true, fee: 6900, max: 300000 } })
    expect(resolveDelivery('799001', floor, setup())).toMatchObject({ zone: 'Special', freeAbove: null, cod: { on: false, why: 'off' } })
  })
  it("the brand's own zone that lists the PIN code beats every preset", () => {
    expect(resolveDelivery('302012', floor, setup({ ownZoneIds: ['Jaipur same city'] }))).toMatchObject({ zone: 'Jaipur same city', charge: 3900, days: [1, 2] })
    expect(zoneFor('302012', setup({ ownZoneIds: ['Jaipur same city'] }))?.id).toBe('Jaipur same city')
  })
  it('a rule beats its zone: no delivery, pay online only, a lower COD limit', () => {
    expect(resolveDelivery('744101', floor, setup({ rule: { rule: 'no_delivery' } })).deliverable).toBe(false)
    expect(resolveDelivery('302012', floor, setup({ rule: { rule: 'prepaid_only' } })).cod).toEqual({ on: false, why: 'prepaid_only' })
    expect(resolveDelivery('845401', floor, setup({ rule: { rule: 'cod_max', codMax: 150000 } })).cod).toMatchObject({ on: true, max: 150000 })
    expect(resolveDelivery('302012', floor, setup({ rule: { rule: 'cod_max', codMax: 150000 } })).cod).toMatchObject({ on: true, max: 150000 })
  })
  it("the floor's no-COD list still applies inside a zone", () => {
    expect(resolveDelivery('110094', floor, setup()).cod).toEqual({ on: false, why: 'blocked_pincode' })
  })
  it('no zones saved yet, or a malformed PIN code: the floor', () => {
    expect(resolveDelivery('302012', floor, setup({ zones: [] }))).toMatchObject({ zone: null, charge: 7900 })
    expect(resolveDelivery('30201', floor, setup())).toMatchObject({ zone: null })
  })
})

describe('chargeOn', () => {
  it('the charge below the threshold; free at it; none without a charge or a threshold', () => {
    expect(chargeOn(100000, { charge: 7900, freeAbove: 199900 })).toBe(7900)
    expect(chargeOn(199900, { charge: 7900, freeAbove: 199900 })).toBe(0)
    expect(chargeOn(500000, { charge: 14900, freeAbove: null })).toBe(14900)
    expect(chargeOn(1, { charge: 0, freeAbove: null })).toBe(0)
  })
})
