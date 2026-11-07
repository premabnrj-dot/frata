import { describe, expect, it } from 'vitest'
import { ORDER_STATES } from '@/domains/orders/order-state'
import { CANCEL_LABEL, type CancelReason } from '@/domains/orders/work'
import { eventLabel, STATE } from '../labels'

const say = (kind: string, reason: string | null = null, fields: string[] | null = null) => eventLabel({ kind, reason, fields }, (r) => CANCEL_LABEL[r as CancelReason] ?? r)

describe('order history in words', () => {
  it('each kind of event says what happened, never a value', () => {
    expect(say('confirmed')).toBe('Confirmed')
    expect(say('confirmed', 'from_hold')).toBe('Confirmed (was on hold)')
    expect(say('undone', 'confirmed')).toBe('Undid the confirmation')
    expect(say('undone', 'unheld')).toBe('Put back on hold')
    expect(say('edited', null, ['addressLine', 'city'])).toBe('Changed the address, city')
    expect(say('cancelled', 'fake')).toBe('Cancelled · Fake order')
    expect(say('packed')).toBe('Packed · invoice issued')
  })
  it('every order state has a label and a tone', () => {
    for (const s of ORDER_STATES) expect(STATE[s].label.length).toBeGreaterThan(0)
  })
})
