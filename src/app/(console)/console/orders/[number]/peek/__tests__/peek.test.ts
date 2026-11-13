import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { PEEK_KEYS } from '../../../_components/peek-types'
import { toPeek } from '../peek'

const order = {
  id: 'o', number: 1043, customerName: 'Sneha', phone: '9845012345', addressLine: '12 MG Road', area: 'Indiranagar', landmark: '', city: 'Bengaluru',
  state: 'Karnataka', pincode: '560038', total: 150800, erasedAt: null, placedAt: new Date('2026-11-13T05:00:00Z'), paymentMethod: 'cod',
  payBy: null, paidAt: null, switchedToCodAt: null, confirmedAt: null, heldAt: null, packedAt: null, shippedAt: null, ndrAt: null, deliveredAt: null,
  cancelledAt: null, rtoInitiatedAt: null, rtoDeliveredAt: null, lostAt: null, refundedAt: null,
} as never

describe('quick look', () => {
  it('says only what it was built to say: no cost, no raw column', () => {
    const p = toPeek({ order, lines: [{ title: 'Kurta', options: ['M'], qty: 1, unitPrice: 150800, unitCost: 90000 } as never], events: [] }, 'KS', new Date())
    expect(Object.keys(p).sort()).toEqual([...PEEK_KEYS].sort())
    expect(Object.keys(p.lines[0]!).sort()).toEqual(['options', 'price', 'qty', 'title'])
    expect(JSON.stringify(p)).not.toMatch(/cost|900\.00|₹900/i)
  })
  it('an erased order shows no shopper', () => {
    const p = toPeek({ order: { ...(order as object), erasedAt: new Date(), customerName: '', phone: '' } as never, lines: [], events: [] }, 'KS', new Date())
    expect([p.customer, p.phone, p.address]).toEqual(['Erased', '', ''])
  })
})
