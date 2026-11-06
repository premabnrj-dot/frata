import { describe, expect, it } from 'vitest'
import { codFor, shippingFor } from '../delivery'

const r = { shippingFlat: 7900, freeShippingAbove: 199900, codOn: true, codMin: 50000, codMax: 300000, codCharge: 4900 }

describe('delivery', () => {
  it('charges flat shipping below the free threshold', () => {
    expect(shippingFor(149000, r)).toBe(7900)
    expect(shippingFor(199900, r)).toBe(0)
    expect(shippingFor(100, { shippingFlat: 0, freeShippingAbove: 0 })).toBe(0)
  })
  it('offers COD with its total, or says why not', () => {
    expect(codFor(249000, r)).toEqual({ offered: true, total: 249000 + 4900, charge: 4900 })
    expect(codFor(40000, r)).toEqual({ offered: false, reason: 'below_min', min: 50000 })
    expect(codFor(299000, r)).toEqual({ offered: false, reason: 'above_max', max: 300000 })
    expect(codFor(249000, { ...r, codOn: false })).toEqual({ offered: false, reason: 'off' })
  })
})
