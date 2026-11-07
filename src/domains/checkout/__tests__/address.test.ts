import { describe, expect, it } from 'vitest'
import { Address, addressErrors, cleanMobile, maskPhone } from '../address'

const ok = { phone: '+91 98290-43210', name: ' Ananya  Sharma ', pincode: '302 001', addressLine: 'B-14, Tilak Marg', area: 'C-Scheme', city: 'Jaipur', state: 'Rajasthan' }

describe('checkout address', () => {
  it('cleans what shoppers type', () => {
    expect(cleanMobile('098290 43210')).toBe('9829043210')
    expect(cleanMobile('919829043210')).toBe('9829043210')
    expect(cleanMobile('5829043210')).toBeNull()
    expect(cleanMobile('98290432')).toBeNull()
    const r = Address.safeParse(ok)
    expect(r.success && r.data).toMatchObject({ phone: '9829043210', name: 'Ananya Sharma', pincode: '302001', landmark: '' })
  })
  it('says what is wrong, per field', () => {
    const r = Address.safeParse({ ...ok, phone: '12345', pincode: '0123', state: 'Atlantis' })
    expect(r.success).toBe(false)
    if (!r.success) expect(Object.keys(addressErrors(r.error)).sort()).toEqual(['phone', 'pincode', 'state'])
    expect(maskPhone('9829043210')).toBe('…3210')
  })
})
