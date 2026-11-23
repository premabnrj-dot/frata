import { describe, expect, it } from 'vitest'
import { holds, type Capability } from '../../tenancy/roles'
import { nextStep, notYet, readyToOpen, setupSteps, type SetupFacts } from '../checklist'

const fresh: SetupFacts = { productCount: 0, legalName: '', grievanceName: '', grievanceEmail: '', grievancePhone: '', codOn: true, paymentsConnected: false, publishedAt: null }
const officer = { grievanceName: 'Riya', grievanceEmail: 'care@kesar.in', grievancePhone: '9827041001' }
const details = { legalName: 'Kesar Studio LLP', ...officer }
const as = (role: string) => (c: Capability) => holds(role, c)

describe('setupSteps (O2a·1: four derived steps)', () => {
  it('a new store: can take Pay on delivery, nothing else done, 1 of 4', () => {
    const s = setupSteps(fresh)
    expect(s.map((x) => [x.key, x.done])).toEqual([['product', false], ['details', false], ['payments', true], ['publish', false]])
    expect(s.filter((x) => x.done)).toHaveLength(1)
  })
  it('each step has its title, its button and who may act on it, as drawn', () => {
    expect(setupSteps(fresh).map((x) => [x.key, x.title, x.action, x.who])).toEqual([
      ['product', 'Add your first product', 'Add product', 'shop.work'],
      ['details', 'Add business details', 'Add details', 'shop.build'],
      ['payments', 'Choose how shoppers pay', 'Change payments', 'shop.build'],
      ['publish', 'Open your store', 'Open store', 'shop.manage'],
    ])
  })
  it('a done step says what it holds; an open one says nothing', () => {
    const value = (f: Partial<SetupFacts>, k: string) => setupSteps({ ...fresh, ...f }).find((x) => x.key === k)!.value
    expect(value({}, 'product')).toBe('')
    expect(value({ productCount: 1 }, 'product')).toBe('1 product')
    expect(value({ productCount: 3 }, 'product')).toBe('3 products')
    expect(value({ legalName: 'Kesar Studio LLP' }, 'details')).toBe('')
    expect(value(details, 'details')).toBe('Kesar Studio LLP')
    expect(value({}, 'payments')).toBe('Pay on delivery')
    expect(value({ paymentsConnected: true }, 'payments')).toBe('UPI, cards and Pay on delivery')
    expect(value({ codOn: false, paymentsConnected: true }, 'payments')).toBe('UPI and cards')
    expect(value({ codOn: false }, 'payments')).toBe('')
    expect(value({}, 'publish')).toBe('')
    expect(value({ publishedAt: new Date() }, 'publish')).toBe('Open')
  })
  it('details are done only with a legal name AND a whole grievance officer: name, email and phone (owner 2026-11-07)', () => {
    const done = (f: Partial<SetupFacts>) => setupSteps({ ...fresh, legalName: 'Kesar LLP', ...f }).find((x) => x.key === 'details')!.done
    expect(done({})).toBe(false)
    expect(done({ grievanceName: 'Riya' })).toBe(false) // a name alone opened a shop before 2026-11-07
    expect(done({ grievanceName: 'Riya', grievanceEmail: 'care@kesar.in' })).toBe(false)
    expect(done(officer)).toBe(true)
    expect(done({ ...officer, legalName: '  ' })).toBe(false)
  })
})

describe('nextStep', () => {
  const next = (f: Partial<SetupFacts>, role: string) => nextStep(setupSteps({ ...fresh, ...f }), as(role))?.key ?? null
  it('an owner: the product, then the details, then opening', () => {
    expect(next({}, 'owner')).toBe('product')
    expect(next({ productCount: 1 }, 'owner')).toBe('details')
    expect(next({ productCount: 1, ...details }, 'owner')).toBe('publish')
    expect(next({ productCount: 1, ...details, codOn: false }, 'owner')).toBe('payments')
    expect(next({ productCount: 1, ...details, publishedAt: new Date() }, 'owner')).toBeNull()
  })
  it('Staff: the product, then nothing', () => {
    expect(next({}, 'staff')).toBe('product')
    expect(next({ productCount: 1 }, 'staff')).toBeNull()
  })
  it('a partner: the product, then the details, never opening', () => {
    expect(next({}, 'partner')).toBe('product')
    expect(next({ productCount: 1 }, 'partner')).toBe('details')
    expect(next({ productCount: 1, ...details }, 'partner')).toBeNull()
  })
  it('opening is never next while another step is open, even for someone who may not do that step', () => {
    const noBuild = (c: Capability) => c !== 'shop.build'
    expect(nextStep(setupSteps({ ...fresh, productCount: 1 }), noBuild)).toBeNull()
    expect(nextStep(setupSteps({ ...fresh, ...details }), as('admin'))?.key).toBe('product')
  })
})

describe('the opening gate (O2a·0 regression net)', () => {
  it('readyToOpen is false until a product, the details and a way to pay are all done', () => {
    const ready = (f: Partial<SetupFacts>) => readyToOpen(setupSteps({ ...fresh, ...f }))
    expect(ready({})).toBe(false)
    expect(ready({ productCount: 1 })).toBe(false)
    expect(ready({ ...details })).toBe(false)
    expect(ready({ productCount: 1, ...details, codOn: false })).toBe(false)
    expect(ready({ productCount: 1, ...details })).toBe(true)
    expect(ready({ productCount: 1, ...details, codOn: false, paymentsConnected: true })).toBe(true)
  })
  it('openShop’s refusal names each missing step, in order, and nothing once ready', () => {
    const line = (f: Partial<SetupFacts>) => notYet(setupSteps({ ...fresh, ...f }))
    expect(line({ codOn: false })).toBe('Not yet: add your first product, add business details, choose how shoppers pay.')
    expect(line({})).toBe('Not yet: add your first product, add business details.')
    expect(line({ productCount: 1 })).toBe('Not yet: add business details.')
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
