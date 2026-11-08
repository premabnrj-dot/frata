import { describe, expect, it } from 'vitest'
import { freightOf } from '../freight'
import { billableDelivered, outcomeUndoOpen, shippedUndoOpen } from '../outcomes'

const none = { forwardShipping: null, rtoShipping: null, courierCodFee: null }
const est = { delivery: 7000, ret: 7000, codFee: 3600 }

describe('freightOf', () => {
  it('Shiprocket: the statement lines; a line not arrived yet takes the confirmed estimate; with none, pending (never ₹0)', () => {
    expect(freightOf('shiprocket', { forwardShipping: 6200, rtoShipping: null, courierCodFee: 3600 }, est, { cod: true, outcome: 'delivered' }))
      .toEqual({ forwardShipping: 6200, rtoShipping: 0, codFee: 3600, source: 'actual' })
    expect(freightOf('shiprocket', none, est, { cod: true, outcome: 'delivered' })).toEqual({ forwardShipping: 7000, rtoShipping: 0, codFee: 3600, source: 'estimate' })
    expect(freightOf('shiprocket', { forwardShipping: 6200, rtoShipping: null, courierCodFee: null }, est, { cod: true, outcome: 'delivered' }))
      .toEqual({ forwardShipping: 6200, rtoShipping: 0, codFee: 3600, source: 'estimate' })
    expect(freightOf('shiprocket', { forwardShipping: 6200, rtoShipping: null, courierCodFee: 0 }, est, { cod: true, outcome: 'rto' }))
      .toEqual({ forwardShipping: 6200, rtoShipping: 7000, codFee: 0, source: 'estimate' })
    for (const o of ['delivered', 'rto'] as const) expect(freightOf('shiprocket', none, null, { cod: true, outcome: o }).source).toBe('pending')
    // A COD fee reversed on a return nets to 0 in the actual lines.
    expect(freightOf('shiprocket', { forwardShipping: 6200, rtoShipping: 6200, courierCodFee: 0 }, est, { cod: true, outcome: 'rto' }))
      .toEqual({ forwardShipping: 6200, rtoShipping: 6200, codFee: 0, source: 'actual' })
  })
  it('shipped another way (or not yet shipped): the confirmed estimate; its COD fee only when a COD order is delivered', () => {
    expect(freightOf('self', none, est, { cod: true, outcome: 'delivered' })).toEqual({ forwardShipping: 7000, rtoShipping: 7000, codFee: 3600, source: 'estimate' })
    expect(freightOf(null, none, est, { cod: true, outcome: 'rto' }).codFee).toBe(0)
    expect(freightOf('self', none, est, { cod: false, outcome: 'delivered' }).codFee).toBe(0)
  })
  it('with no confirmed estimate, freight is left out and says so', () => {
    expect(freightOf('self', none, null, { cod: true, outcome: 'delivered' })).toEqual({ forwardShipping: 0, rtoShipping: 0, codFee: 0, source: 'none' })
  })
})

describe('billableDelivered (call E)', () => {
  const now = new Date('2026-12-15T10:00:00Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)
  const o = { shippedAt: daysAgo(31), deliveredAt: null, rtoInitiatedAt: null, lostAt: null }
  it('delivered is billable; shipped 30+ days with no outcome counts as delivered', () => {
    expect(billableDelivered({ ...o, deliveredAt: daysAgo(1) }, now)).toBe(true)
    expect(billableDelivered(o, now)).toBe(true)
    expect(billableDelivered({ ...o, shippedAt: daysAgo(29) }, now)).toBe(false)
  })
  it('never when it came back, was lost by the courier, or never shipped', () => {
    expect(billableDelivered({ ...o, rtoInitiatedAt: daysAgo(2) }, now)).toBe(false)
    expect(billableDelivered({ ...o, deliveredAt: daysAgo(3), rtoInitiatedAt: daysAgo(2) }, now)).toBe(false) // a return outranks delivered
    expect(billableDelivered({ ...o, lostAt: daysAgo(3) }, now)).toBe(false)
    expect(billableDelivered({ ...o, shippedAt: null }, now)).toBe(false)
  })
})

describe('freightOf: lost by the courier', () => {
  it('only the forward leg: actual from Shiprocket (pending until it arrives), else the estimate, else none', () => {
    expect(freightOf('shiprocket', { forwardShipping: 6200, rtoShipping: 6200, courierCodFee: 3600 }, est, { cod: true, outcome: 'lost' }))
      .toEqual({ forwardShipping: 6200, rtoShipping: 0, codFee: 0, source: 'actual' })
    expect(freightOf('shiprocket', none, est, { cod: true, outcome: 'lost' }).source).toBe('pending')
    expect(freightOf('self', none, est, { cod: true, outcome: 'lost' })).toEqual({ forwardShipping: 7000, rtoShipping: 0, codFee: 0, source: 'estimate' })
    expect(freightOf(null, none, null, { cod: false, outcome: 'lost' }).source).toBe('none')
  })
})

describe('outcomeUndoOpen', () => {
  it('until the IST month it was marked in ends', () => {
    expect(outcomeUndoOpen(new Date('2026-11-30T18:00:00Z'), new Date('2026-11-30T18:20:00Z'))).toBe(true) // 23:30 → 23:50 IST, 30 Nov
    expect(outcomeUndoOpen(new Date('2026-11-30T18:00:00Z'), new Date('2026-11-30T18:31:00Z'))).toBe(false) // 00:01 IST, 1 Dec
  })
  it('Shipped: within its month, and never once it counts as delivered (30 days), so the billing clock never restarts', () => {
    const shipped = new Date('2026-12-01T00:00:00+05:30')
    expect(shippedUndoOpen(shipped, new Date('2026-12-20T10:00:00+05:30'))).toBe(true)
    expect(shippedUndoOpen(shipped, new Date('2026-12-31T00:00:00+05:30'))).toBe(false) // 30 days, still December
    expect(shippedUndoOpen(new Date('2026-11-30T23:00:00+05:30'), new Date('2026-12-01T09:00:00+05:30'))).toBe(false) // next month
  })
})
