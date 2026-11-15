import { describe, expect, it } from 'vitest'
import { keptOf, orderKeep, type KeptGroup } from '../kept'

const est = { delivery: 7800, ret: 7800, codFee: 4000 }
const row = { provider: 'self' as const, cod: true, net: 218096, cogs: 99000, forward: 7800, rto: 7800, courierCodFee: 4000, gateway: 0, base: 213429, feeBps: 200 }

describe('orderKeep: one order before its outcome, by the rule keptOf uses', () => {
  it('each outcome equals keptOf over a group of one', () => {
    const k = orderKeep(row, est)
    const one = (g: Partial<KeptGroup>) => keptOf([{ ...row, outcome: 'delivered', n: 1, restocked: false, ...g } as KeptGroup], est).kept + 0
    expect(k.ifDelivered! + 0).toBe(one({}))
    expect(k.ifBack! + 0).toBe(one({ outcome: 'rto', restocked: true }))
    expect(k.ifBack!).toBeLessThan(0) // both courier legs
    expect(k.ifBackNotStocked! + 0).toBe(one({ outcome: 'rto', restocked: false }))
    expect(k.fee).toBeGreaterThan(0)
    expect(k.missing).toBeNull()
  })
  it('the fee is only on delivered, and the goods are lost only when they cannot go back in stock', () => {
    const k = orderKeep(row, est)
    expect(k.ifBack! - k.ifBackNotStocked!).toBe(row.cogs)
  })
  it('an unknown goods cost says so (never ₹0); a return put back in stock needs no goods cost', () => {
    const k = orderKeep({ ...row, cogs: null }, est)
    expect(k.ifDelivered).toBeNull(); expect(k.missing).toBe('cogs')
    expect(k.ifBack).not.toBeNull()
  })
})
