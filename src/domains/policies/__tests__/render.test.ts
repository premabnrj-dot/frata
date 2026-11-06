import { describe, expect, it } from 'vitest'
import { missingFacts, POLICY_PAGES, renderPolicy, type PolicyFacts } from '../render'

const inr = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`
const full: PolicyFacts = {
  shopName: 'Kesar Studio', legalName: 'Kesar Studio LLP', address: '14 Shanti Nagar, Indore 452009', supportEmail: 'hello@kesar.in', supportPhone: '9827041000',
  grievanceName: 'Riya Mehta', grievanceRole: 'Partner', grievanceEmail: 'care@kesar.in', grievancePhone: '9827041001',
  returnKind: 'exchange_or_refund', returnDays: 7, shippingFlat: 7900, freeShippingAbove: 199900, dispatchDays: 2, metroDays: 4, restDays: 7,
  codOn: true, codMax: 300000, codCharge: 4900, pricesIncludeGst: true,
}
const text = (pieces: ReturnType<typeof renderPolicy>) => pieces.map((para) => para.map((p) => ('text' in p ? p.text : p.value ?? `[${p.fact}]`)).join('')).join('\n')

describe('renderPolicy', () => {
  it('follows the settings: change the shipping charge and the page changes', () => {
    expect(text(renderPolicy('shipping', full, inr))).toContain('Shipping costs ₹79, and is free on orders above ₹1,999.')
    expect(text(renderPolicy('shipping', { ...full, shippingFlat: 9900 }, inr))).toContain('Shipping costs ₹99')
    expect(text(renderPolicy('shipping', full, inr))).toContain('with a ₹49 fee shown before you order')
  })
  it('says exactly what a shopper may ask for', () => {
    expect(text(renderPolicy('returns', { ...full, returnKind: 'exchange_only' }, inr))).not.toContain('Refunds go')
    expect(text(renderPolicy('returns', { ...full, returnKind: 'none' }, inr))).toContain('cannot be returned')
  })
  it('a complete shop has nothing missing on any page', () => {
    for (const [page] of POLICY_PAGES) expect(missingFacts(renderPolicy(page, full, inr)), page).toEqual([])
  })
  it('names what is missing', () => {
    const m = missingFacts(renderPolicy('contact', { ...full, grievanceName: '', legalName: ' ' }, inr))
    expect(m).toEqual(['legal business name', 'grievance officer'])
  })
})
