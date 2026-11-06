import { describe, expect, it } from 'vitest'
import { fromRupees, paise } from '@/domains/money/paise'
import { contributionPer100, orderProfit, type OrderCosts } from '../profit'

// A ₹1,000 COD kurta: the shape of a typical order, not a benchmark.
const cod: OrderCosts = {
  netRevenue: fromRupees(1000),
  cogs: fromRupees(350),
  forwardShipping: fromRupees(70),
  rtoShipping: fromRupees(60),
  codFee: fromRupees(30),
  gatewayBps: 0,
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
  it('weights the two by the chance of delivery', () => {
    // 0.8 × 270 + 0.2 × −430 = 130
    expect(orderProfit(cod, 0.8).expected).toBe(fromRupees(130))
  })
  it('charges the gateway on prepaid revenue', () => {
    const prepaid = { ...cod, codFee: paise(0), gatewayBps: 200 }
    expect(orderProfit(prepaid, 1).ifDelivered).toBe(fromRupees(280)) // 270 + 30 COD − 20 gateway
  })
  it('refuses a probability outside 0..1', () => {
    expect(() => orderProfit(cod, 1.2)).toThrow()
  })
  it('speaks per ₹100 of order value', () => {
    expect(contributionPer100(fromRupees(130), fromRupees(1000))).toBe(13)
  })
})
