import { describe, expect, it } from 'vitest'
import { taxOrder } from '@/domains/tax/gst'
import { charged, collect, paidOnline, refundDue, sharesOf, type StoredLine, type StoredOrder } from '../amounts'

// Two kurtas (₹2,490 at 5%, ₹3,200 at 18%), ₹79 delivery, ₹49 COD fee, prices include GST — as checkout stores them.
const gross = [{ gross: 249000, unitPrice: 249000, hsn: '6211' }, { gross: 320000, unitPrice: 320000, hsn: '6211' }]
const atCheckout = (charges: number) => taxOrder(gross, charges, { registered: true, pricesIncludeGst: true })
const lines = (withShares: boolean, charges = 7900 + 4900): StoredLine[] => atCheckout(charges).lines.map((l) => ({
  taxableValue: l.taxable, gst: l.gst, gstBps: l.bps, chargeTaxable: withShares ? l.chargeTaxable : null, chargeGst: withShares ? l.chargeGst : null,
}))
const order = (o: Partial<StoredOrder> = {}): StoredOrder => {
  const t = atCheckout(12800)
  const gstTotal = t.lines.reduce((a, l) => a + l.gst, 0) + t.chargesGst
  return { paymentMethod: 'cod', paidAt: null, switchedToCodAt: null, cancelledAt: null, subtotal: 569000, shipping: 7900, codCharge: 4900, gstTotal, total: 569000 + 12800, pricesIncludeGst: true, ...o }
}

describe('amounts', () => {
  it('recomputing from stored rates gives exactly what checkout stored', () => {
    const o = order()
    const r = charged(lines(false), o, 4900)
    expect(r.gstTotal).toBe(o.gstTotal)
    expect(r.total).toBe(o.total)
    expect(sharesOf(lines(false), o)).toEqual(sharesOf(lines(true), o))
  })
  it('a capture after a switch: the COD fee comes off, and its GST with it', () => {
    const after = charged(lines(false), order(), 0)
    const prepaid = atCheckout(7900)
    expect(after.total).toBe(569000 + 7900)
    expect(after.gstTotal).toBe(prepaid.lines.reduce((a, l) => a + l.gst, 0) + prepaid.chargesGst)
    expect(after.shares.reduce((a, s) => a + s.chargeTaxable + s.chargeGst, 0)).toBe(7900)
  })
  it('collect at the door only on a live COD order; paid online collects nothing; a cancelled paid order is refunded', () => {
    expect(collect(order())).toBe(581800)
    expect(collect(order({ cancelledAt: new Date() }))).toBe(0)
    const paidAfterSwitch = order({ paymentMethod: 'prepaid', switchedToCodAt: new Date(), paidAt: new Date(), codCharge: 0, total: 576900 })
    expect(collect(paidAfterSwitch)).toBe(0)
    expect(paidOnline(paidAfterSwitch)).toBe(576900)
    expect(refundDue(paidAfterSwitch)).toBe(0)
    expect(refundDue({ ...paidAfterSwitch, cancelledAt: new Date() })).toBe(576900)
    expect(refundDue(order({ cancelledAt: new Date() }))).toBe(0)
  })
})
