import { describe, expect, it } from 'vitest'
import { browserShares, cityShares, emptyTotals, funnel, OTHER_PRODUCTS, p75, perHundred, productLines, slowestPage, speedOf, visitsBySource, type SourceVisitRow } from '../traffic'
import { sourceOfInputs } from '../source'

const row = (o: Partial<SourceVisitRow>): SourceVisitRow => ({ us: '', um: '', uc: '', rh: '', cc: '', gads: false, srs: false, fb: false, visitors: 10, ordered: 0, ...o })
const bucketOf = (v: number) => Math.min(63, Math.floor(Math.log(v + 1) / Math.log(1.2)))
const hist = (values: number[]) => { const b = Array(64).fill(0); for (const v of values) b[bucketOf(v)]++; return b }

describe('traffic.ts', () => {
  it('classifies visits exactly as orders are, so both sides share a slug', () => {
    const v = visitsBySource([row({ us: 'instagram', um: 'bio', visitors: 80 }), row({ rh: 'l.instagram.com', visitors: 5 }), row({ rh: '*', visitors: 7 }), row({ visitors: 30 })], new Map())
    const order = sourceOfInputs({ us: 'instagram', um: 'bio', uc: null, rh: null, gads: false, srs: false, fb: false, cl: null, cc: null })
    expect(v.get(order.slug)?.visitors).toBe(80)
    expect(v.get('other')?.visitors).toBe(7)
    expect([...v.values()].reduce((n, s) => n + s.visitors, 0)).toBe(122)
  })
  it('a creator code names the creator only when the shop has the label', () => {
    const labels = new Map([['RIYA51', 'Riya']])
    const named = visitsBySource([row({ cc: 'riya51', visitors: 9 })], labels)
    expect([...named.values()][0]!.channel).toBe('creator')
    const unnamed = visitsBySource([row({ cc: 'FORGED', visitors: 9 })], labels)
    expect([...unnamed.values()][0]!.channel).toBe('direct')
  })
  it('per 100 visits needs enough visits', () => {
    expect(perHundred(13, 1000)).toBe(1.3)
    expect(perHundred(1, 50)).toBeNull()
    expect(perHundred(212, 18400, 1, 2)).toBe(1.15)
  })
  it('browsers and cities: in-app first-class, fewer than 5 visitors fold into Other', () => {
    const b = browserShares([{ device: 'phone', browser: 'chrome', inApp: 'instagram', visitors: 460, ordered: 3 }, { device: 'phone', browser: 'chrome', inApp: '', visitors: 310, ordered: 5 },
      { device: 'phone', browser: 'firefox', inApp: '', visitors: 4, ordered: 0 }])
    expect(b.map((s) => s.name)).toEqual(['Instagram’s in-app browser', 'Chrome', 'Other'])
    expect(b[2]!.visitors).toBe(4)
    const c = cityShares([{ city: 'Pune', visitors: 210, ordered: 3 }, { city: 'Nagpur', visitors: 3, ordered: 0 }, { city: '', visitors: 40, ordered: 1 }])
    expect(c.map((s) => [s.name, s.visitors])).toEqual([['Pune', 210], ['Other', 43]])
  })
  it('the funnel takes visits, then orders and deliveries, and names the biggest drop', () => {
    const t = { ...emptyTotals(), visitors: 18400, productVisitors: 9900, bagVisitors: 1420, checkoutVisitors: 610 }
    const f = funnel(t, 212, 141)
    expect(f.steps.map((s) => s.n)).toEqual([18400, 9900, 1420, 610, 212, 141])
    expect(f.drop?.from).toBe('Saw a product')
    expect(f.steps[0]!.ofAbove).toBeNull()
  })
  it('p75 from the histogram is within its ±10% precision; speed is judged as Google does', () => {
    const lcp = [1200, 1500, 1800, 2000, 2100, 2200, 2300, 2400]
    const v = p75(hist(lcp))!
    expect(v).toBeGreaterThan(2300 / 1.1)
    expect(v).toBeLessThan(2300 * 1.1)
    expect(p75(Array(64).fill(0))).toBeNull()
    const s = speedOf([{ metric: 'lcp', n: 8, buckets: hist(lcp) }, { metric: 'inp', n: 8, buckets: hist([80, 120, 150]) }, { metric: 'cls', n: 8, buckets: hist([20, 40]) }])
    expect(s.verdict).toBe('good')
    expect(speedOf([{ metric: 'lcp', n: 8, buckets: hist([6000, 7000]) }]).verdict).toBe('poor')
  })
  it('names only the shop\'s own products; the slowest page needs 20 samples and is never "other products"', () => {
    const names = new Map([['a', { title: 'Chanderi kurta set', handle: 'chanderi', ordered: 61 }], ['b', { title: 'Banarasi silk saree', handle: 'banarasi', ordered: 18 }]])
    const lines = productLines([{ productId: 'a', views: 2900, adds: 406 }, { productId: 'b', views: 2100, adds: 40 }, { productId: 'forged', views: 9999, adds: 9999 }], names)
    expect(lines.map((l) => l.title)).toEqual(['Chanderi kurta set', 'Banarasi silk saree'])
    expect(lines[1]!.hint).toBe('Looked at often, rarely bagged')
    expect(slowestPage([{ productId: 'a', n: 19, buckets: hist([9000]) }, { productId: OTHER_PRODUCTS, n: 50, buckets: hist([9000]) }, { productId: 'b', n: 25, buckets: hist([3400]) }])?.productId).toBe('b')
  })
})
