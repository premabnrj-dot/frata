// What a shopper's browser receives of a quote with offers: named public fields only (ADR-0003, offers tenancy
// review 4) — never an offer's id, its terms object, a code id, a limit or a budget.
import { describe, expect, it } from 'vitest'
import { quote, type ShopRules, type VariantRow } from '@/domains/checkout/quote'
import type { DiscountTerms } from '@/domains/checkout/discounts'
import { publicQuote } from '../shop-api'

const rules: ShopRules = { shippingFlat: 0, freeShippingAbove: 0, codOn: true, codMin: 0, codMax: 0, codCharge: 4900, pricesIncludeGst: true, registered: true, dispatchDays: 2, metroDays: 2, restDays: 5 }
const row: VariantRow = { variantId: 'v', productId: 'p', handle: 'h', title: 'Kurta', status: 'active', publishAt: null, options: [], values: [], sku: null, price: 280000, compareAt: null,
  stock: 5, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, held: 0, preordered: 0, owed: 0, hsn: '6211', image: null }
const offer: DiscountTerms = { id: 'secret-offer-id', title: 'Diwali', style: 'order_off', percentBps: 1500, amountOff: null, cap: 99999, minSubtotal: 0, combinesWithPayment: true, listed: true, code: 'DIWALI15', codeId: 'secret-code-id' }

describe('publicQuote', () => {
  it('maps offers to title, amount, class, code and need — nothing else', () => {
    const pq = publicQuote(quote([{ variantId: 'v', qty: 1 }], [row], rules, new Date(), null, { offers: [offer] }))
    const json = JSON.stringify(pq)
    for (const leak of ['secret-offer-id', 'secret-code-id', '99999', 'percentBps', 'minSubtotal', 'terms', 'discountId', 'codeId', 'budget', 'limit']) expect(json).not.toContain(leak)
    expect(pq.appliedPrepaid).toEqual([{ title: 'Diwali', amount: 42000, class: 'order' }])
    expect(pq.offers.listed).toEqual([{ title: 'Diwali', code: 'DIWALI15', style: 'order_off', applied: true, need: null }])
  })
})
