import { describe, expect, it } from 'vitest'
import { notYet, readyToOpen, setupSteps, type SetupFacts } from '../checklist'

const inr = (p: number) => `₹${p / 100}`
const fresh: SetupFacts = { shopName: 'Kesar Studio', address: 'kesar.frata.store', productCount: 0, legalName: '', grievanceName: '', grievanceEmail: '', grievancePhone: '', codOn: true, codMaxPaise: 300000, paymentsConnected: false, publishedAt: null }
const officer = { grievanceName: 'Riya', grievanceEmail: 'care@kesar.in', grievancePhone: '9827041001' }
const none = { products: false, settings: false, publish: false }

describe('setupSteps', () => {
  it('a new shop: named, can take COD, nothing else done', () => {
    const s = setupSteps(fresh, none, inr)
    expect(s.map((x) => [x.key, x.done])).toEqual([['shop', true], ['product', false], ['details', false], ['payments', true], ['publish', false]])
    expect(s.find((x) => x.key === 'payments')!.detail).toContain('₹3000')
  })
  it('never links to a page that is not built', () => {
    expect(setupSteps(fresh, none, inr).every((x) => x.href === null)).toBe(true)
    expect(setupSteps(fresh, { products: true, settings: true, publish: true }, inr).find((x) => x.key === 'product')!.href).toBe('/console/products')
  })
  it('details go where the missing field is: the legal name in Business and GST, then the grievance officer in Contact', () => {
    const built = { products: true, settings: true, publish: true }
    expect(setupSteps(fresh, built, inr).find((x) => x.key === 'details')!.href).toBe('/console/settings/business')
    expect(setupSteps({ ...fresh, legalName: 'Kesar LLP' }, built, inr).find((x) => x.key === 'details')!.href).toBe('/console/settings/contact')
  })
  it('publishing waits for a product and a way to pay', () => {
    const built = { products: true, settings: true, publish: true }
    expect(setupSteps(fresh, built, inr).find((x) => x.key === 'publish')!.href).toBeNull()
    expect(setupSteps({ ...fresh, productCount: 1, codOn: false }, built, inr).find((x) => x.key === 'publish')!.detail).toBe('Needs a way to pay first.')
    // The step itself is a button on Home (Open my shop), pressed only when every other step is done.
    expect(readyToOpen(setupSteps({ ...fresh, productCount: 1 }, built, inr))).toBe(false)
    expect(readyToOpen(setupSteps({ ...fresh, productCount: 1, legalName: 'Kesar Studio LLP', ...officer }, built, inr))).toBe(true)
  })
  it('details are done only with a legal name AND a whole grievance officer: name, email and phone (owner 2026-11-07)', () => {
    const done = (f: Partial<SetupFacts>) => setupSteps({ ...fresh, legalName: 'Kesar LLP', ...f }, none, inr).find((x) => x.key === 'details')!.done
    expect(done({})).toBe(false)
    expect(done({ grievanceName: 'Riya' })).toBe(false) // a name alone opened a shop before 2026-11-07
    expect(done({ grievanceName: 'Riya', grievanceEmail: 'care@kesar.in' })).toBe(false)
    expect(done(officer)).toBe(true)
  })
})

describe('the opening gate (O2a·0 regression net)', () => {
  const built = { products: true, settings: true, publish: true }
  const details = { legalName: 'Kesar Studio LLP', ...officer }
  it('readyToOpen is false until a product, the details and a way to pay are all done', () => {
    const ready = (f: Partial<SetupFacts>) => readyToOpen(setupSteps({ ...fresh, ...f }, built, inr))
    expect(ready({})).toBe(false)
    expect(ready({ productCount: 1 })).toBe(false)
    expect(ready({ ...details })).toBe(false)
    expect(ready({ productCount: 1, ...details, codOn: false })).toBe(false)
    expect(ready({ productCount: 1, ...details })).toBe(true)
    expect(ready({ productCount: 1, ...details, codOn: false, paymentsConnected: true })).toBe(true)
  })
  it('openShop’s refusal names each missing step, in order, and nothing once ready', () => {
    const line = (f: Partial<SetupFacts>) => notYet(setupSteps({ ...fresh, ...f }, built, inr))
    expect(line({ codOn: false })).toBe('Not yet: add your first product, business details and grievance officer, how shoppers pay.')
    expect(line({})).toBe('Not yet: add your first product, business details and grievance officer.')
    expect(line({ productCount: 1 })).toBe('Not yet: business details and grievance officer.')
    expect(line({ ...details })).toBe('Not yet: add your first product.')
    expect(line({ productCount: 1, ...details })).toBeNull()
  })
})

describe('websiteBlocksOpening (D0·3)', async () => {
  const { websiteBlocksOpening } = await import('../checklist')
  it('refuses while a Test key builds a website with no proved address, and only then', () => {
    expect(websiteBlocksOpening({ siteOrigin: null, buildingKeys: 1 })).toBe(true)
    expect(websiteBlocksOpening({ siteOrigin: 'https://kesarstudio.in', buildingKeys: 1 })).toBe(false)
    expect(websiteBlocksOpening({ siteOrigin: null, buildingKeys: 0 })).toBe(false)
    expect(websiteBlocksOpening({ siteOrigin: 'https://kesarstudio.in', buildingKeys: 0 })).toBe(false)
  })
})
