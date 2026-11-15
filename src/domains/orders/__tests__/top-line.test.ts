import { describe, expect, it } from 'vitest'
import { orderTopLine, type TopLineFacts } from '../top-line'

const inr = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`
const base: TopLineFacts = { state: 'confirmed', method: 'cod', paid: false, paidAfterPacking: false, paidAfterSwitch: false, owed: 229000, refund: 0, canCancel: true, inr }
const line = (f: Partial<TopLineFacts>) => orderTopLine({ ...base, ...f })

describe('the order top line', () => {
  it('Pay on delivery to pack or on its way: collect, with when it was confirmed', () => {
    expect(line({ confirmedAt: 'today, 10:14 am' })).toEqual({ tone: 'calm', line: 'Collect ₹2,290 on delivery', sub: 'Confirmed today, 10:14 am.' })
    expect(line({ state: 'shipped' }).line).toBe('Collect ₹2,290 on delivery')
  })
  it('to confirm: the step first, the risk reason under it; paid and held keeps today\'s line', () => {
    expect(line({ state: 'unconfirmed', riskFirst: 'First order from this phone' })).toEqual({ tone: 'warn', line: 'Confirm it before you pack', sub: 'First order from this phone' })
    expect(line({ state: 'held', paid: true, owed: 0 }).line).toBe('Paid online. Collect nothing.')
  })
  it('paid online, and paid after a switch', () => {
    expect(line({ paid: true, owed: 0, method: 'prepaid', paidAt: '10:07 am' })).toEqual({ tone: 'calm', line: 'Paid online. Collect nothing.', sub: 'Razorpay · paid 10:07 am.' })
    expect(line({ paid: true, owed: 0, paidAfterSwitch: true }).line).toBe('Paid online. Don’t collect cash.')
  })
  it('paid after packing keeps the CA step', () => {
    const t = line({ paid: true, paidAfterPacking: true, owed: 0 })
    expect(t.tone).toBe('bad'); expect(t.sub).toContain('Ask your CA if it needs a credit note.')
  })
  it('refund due names who can cancel', () => {
    expect(line({ state: 'refund_due', refund: 229000 }).sub).toBe('Paid after it sold out. Cancel it first.')
    expect(line({ state: 'refund_due', refund: 229000, canCancel: false }).sub).toBe('Paid after it sold out. Cancel it first. Ask the owner or a manager to cancel it.')
    expect(line({ state: 'refund_due', refund: 229000 }).line).toBe('Refund ₹2,290 in Razorpay')
  })
  it('delivered: collected by the courier, or just delivered', () => {
    expect(line({ state: 'delivered', deliveredOn: '18 Nov' })).toEqual({ tone: 'ok', line: '₹2,290 collected by the courier', sub: 'Delivered 18 Nov.' })
    expect(line({ state: 'delivered', paid: true, method: 'prepaid' }).line).toBe('Delivered.')
  })
  it('came back, lost, cancelled, not paid', () => {
    expect(line({ state: 'rto' }).line).toBe('Coming back. Nothing was collected.')
    expect(line({ state: 'rto_received', paid: true }).line).toBe('Came back after it was paid online. Refund the shopper in Razorpay.')
    expect(line({ state: 'lost' }).line).toBe('Lost by the courier. Nothing was collected.')
    expect(line({ state: 'cancelled', cancelWhy: 'By the shopper' })).toEqual({ tone: 'calm', line: 'Cancelled. Nothing to collect.', sub: 'By the shopper' })
    expect(line({ state: 'cancelled', refund: 229000 }).line).toBe('Paid online, then cancelled. Refund ₹2,290 in Razorpay.')
    expect(line({ state: 'awaiting_payment', owed: 0, method: 'prepaid' }).line).toBe('Not paid yet.')
  })
})
