import { describe, expect, it } from 'vitest'
import { orderState, type OrderMoments } from '@/domains/orders/order-state'

// outcomeSql and cameBackSql (order-predicates.ts) test the four timestamps stateSql ranks first. Their claim, checked
// against the one engine over every mix of those four and the rest: outcome ⇔ state is delivered, rto, rto_received or
// lost; came back ⇔ rto or rto_received.
const KEYS = ['rtoDeliveredAt', 'rtoInitiatedAt', 'deliveredAt', 'lostAt', 'cancelledAt', 'shippedAt', 'packedAt', 'paidAt', 'confirmedAt', 'heldAt'] as const
const now = new Date('2026-11-15T10:00:00Z')

describe('the outcome predicates agree with orderState', () => {
  it('for every mix of moments', () => {
    for (let m = 0; m < 1 << KEYS.length; m++) {
      const o = { placedAt: now, paymentMethod: 'cod', payBy: null, switchedToCodAt: null, ndrAt: null } as unknown as Record<string, unknown>
      KEYS.forEach((k, i) => { o[k] = m & (1 << i) ? now : null })
      const s = orderState(o as unknown as OrderMoments, now)
      const outcome = !!(o.rtoDeliveredAt || o.rtoInitiatedAt || o.deliveredAt || o.lostAt)
      const back = !!(o.rtoDeliveredAt || o.rtoInitiatedAt)
      expect(outcome).toBe(['delivered', 'rto', 'rto_received', 'lost'].includes(s))
      expect(back).toBe(['rto', 'rto_received'].includes(s))
    }
  })
})
