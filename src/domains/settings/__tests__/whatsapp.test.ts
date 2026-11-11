import { describe, expect, it } from 'vitest'
import { waLink } from '../whatsapp'

describe('waLink (security review 2026-11-11 H1)', () => {
  it('always carries India\'s 91, however the number was stored', () => {
    for (const n of ['9827041000', '+91 98270-41000', '919827041000', '09827041000']) expect(waLink(n)).toBe('https://wa.me/919827041000')
  })
  it('a number Settings would refuse gives no link (never a guess)', () => {
    for (const n of ['', '12345', '6512345678901', null, undefined]) expect(waLink(n)).toBeNull()
  })
  it('the message is encoded', () => {
    expect(waLink('9827041000', 'Order KS-1043 & more')).toBe('https://wa.me/919827041000?text=Order%20KS-1043%20%26%20more')
  })
})
