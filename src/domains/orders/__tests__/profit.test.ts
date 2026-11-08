import { describe, expect, it } from 'vitest'
import { fromRupees, paise } from '@/domains/money/paise'
import { contributionPer100, estimateGatewayFee, orderProfit, type OrderCosts } from '../profit'

// A ₹1,000 COD kurta: the shape of a typical order, not a benchmark.
const cod: OrderCosts = {
  netRevenue: fromRupees(1000),
  cogs: fromRupees(350),
  forwardShipping: fromRupees(70),
  rtoShipping: fromRupees(60),
  codFee: fromRupees(30),
  gatewayFee: paise(0),
  packaging: fromRupees(20),
  adCost: fromRupees(250),
  platformFee: fromRupees(10),
}

describe('orderProfit', () => {
  it('earns on delivery what is left after every cost', () => {
    expect(orderProfit(cod, 1).ifDelivered).toBe(fromRupees(270))
  })
  it('loses freight both ways, the COD fee and the sunk ad spend on an RTO', () => {
    expect(orderProfit(cod, 0).ifRto).toBe(fromRupees(-430))
  })
  it('a prepaid return is refunded and the gateway keeps its fee', () => {
    expect(orderProfit({ ...cod, codFee: paise(0), gatewayFee: fromRupees(20) }, 0).ifRto).toBe(fromRupees(-420)) // −(340 sunk + 60 return + 20 gateway)
  })
  it('a parcel lost by the courier loses the forward freight, the goods and the sunk spend; no return leg, COD fee or platform fee', () => {
    // −(70 forward + 20 packaging + 250 ads + 350 goods + 0 gateway) = −690
    expect(orderProfit(cod, 0).ifLost).toBe(fromRupees(-690))
    const prepaid = { ...cod, codFee: paise(0), gatewayFee: fromRupees(20) }
    expect(orderProfit(prepaid, 0).ifLost).toBe(fromRupees(-710)) // the gateway kept its fee
  })
  it('weights the two by the chance of delivery', () => {
    // 0.8 × 270 + 0.2 × −430 = 130
    expect(orderProfit(cod, 0.8).expected).toBe(fromRupees(130))
  })
  it('takes the gateway fee as Razorpay charged it', () => {
    const prepaid = { ...cod, codFee: paise(0), gatewayFee: fromRupees(20) }
    expect(orderProfit(prepaid, 1).ifDelivered).toBe(fromRupees(280)) // 270 + 30 COD − 20 gateway
  })
  it('estimates the gateway fee on the gross total, with 18% GST on the fee', () => {
    // ₹2,490 at 2%: ₹49.80 + ₹8.96 GST = ₹58.76 (unit-economics review 2026-11-07)
    expect(estimateGatewayFee(fromRupees(2490), 200)).toBe(5876)
  })
  it('refuses a probability outside 0..1', () => {
    expect(() => orderProfit(cod, 1.2)).toThrow()
  })
  it('speaks per ₹100 of order value', () => {
    expect(contributionPer100(fromRupees(130), fromRupees(1000))).toBe(13)
  })
})
