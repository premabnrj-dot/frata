import { describe, expect, it } from 'vitest'
import { missingFacts, POLICY_PAGES, renderPolicy, type PolicyFacts } from '../render'

const inr = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`
const full: PolicyFacts = {
  shopName: 'Kesar Studio', legalName: 'Kesar Studio LLP', address: '14 Shanti Nagar, Indore 452009', supportEmail: 'hello@kesar.in', supportPhone: '9827041000',
  grievanceName: 'Riya Mehta', grievanceRole: 'Partner', grievanceEmail: 'care@kesar.in', grievancePhone: '9827041001',
  returnKind: 'exchange_or_refund', returnDays: 7, shippingFlat: 7900, freeShippingAbove: 199900, dispatchDays: 2, metroDays: 4, restDays: 7,
  codOn: true, codMax: 300000, codCharge: 4900, pricesIncludeGst: true, sells: ['women', 'ethnic'],
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
  it('says what a returned item must be, by what the shop sells', () => {
    expect(text(renderPolicy('returns', full, inr))).toContain('unused, unwashed and with their tags')
    const beauty = text(renderPolicy('returns', { ...full, sells: ['beauty'] }, inr))
    expect(beauty).toContain('only unopened, with their seal intact')
    expect(beauty).not.toContain('unwashed')
    const mixed = text(renderPolicy('returns', { ...full, sells: ['women', 'jewellery', 'wellness'] }, inr))
    expect(mixed).toContain('unwashed'); expect(mixed).toContain('original packaging'); expect(mixed).toContain('seal intact')
  })
  it('a complete shop has nothing missing on any page', () => {
    for (const [page] of POLICY_PAGES) expect(missingFacts(renderPolicy(page, full, inr)), page).toEqual([])
  })
  it('names what is missing', () => {
    const m = missingFacts(renderPolicy('contact', { ...full, grievanceName: '', legalName: ' ' }, inr))
    expect(m).toEqual(['legal business name', 'grievance officer'])
  })
})

describe('privacy while visits are counted (A·2)', () => {
  it('never says "nothing else" while visits are counted, and says what is counted', () => {
    const text = (f: PolicyFacts) => renderPolicy('privacy', f, (p) => `₹${p}`).map((para) => para.map((x) => ('text' in x ? x.text : x.value)).join('')).join('\n')
    expect(text(full)).toContain('nothing else without asking you')
    const counting = text({ ...full, countsVisits: true })
    expect(counting).not.toContain('nothing else')
    expect(counting).toContain('We count visits to this shop')
    expect(counting).toContain('deleted after 90 days')
  })
})
