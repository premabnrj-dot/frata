import { describe, expect, it } from 'vitest'
import { readyToOpen, setupSteps, type SetupFacts } from '../checklist'

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
