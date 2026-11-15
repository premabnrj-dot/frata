import { describe, expect, it } from 'vitest'
import type { Paise } from '@/domains/money/paise'
import { deliveredFee } from '@/domains/plans/entitlements'
import { cheapestAt, costBar, creditedBase, costShareBps, deliveredSales, GROUP_OF, planCostAt, summarize } from '../charges'
import { LINE_KINDS } from '../bill'

const line = (kind: string, taxable: number) => ({ kind, description: kind, quantity: 1, rateBps: null, taxable })
const PLANS = [
  { code: 'launch', monthlyPrice: 149900, feeBps: 200 },
  { code: 'growth', monthlyPrice: 499900, feeBps: 100 },
  { code: 'scale', monthlyPrice: 1499900, feeBps: 50 },
]

describe('charges', () => {
  it('maps every line kind once, and never shows the over-the-plan count', () => {
    for (const k of LINE_KINDS) expect(k in GROUP_OF).toBe(true)
    expect(GROUP_OF.over).toBeNull()
  })

  it('a summary adds up to the bill: plan, apps, fees, credits, carry; GST heads to the total', () => {
    const lines = [line('fee', 184000), line('plan', 499900), line('addon', 49900), line('credit', -2190), line('over', 0), line('change', 116667)]
    const taxable = 184000 + 499900 + 49900 - 2190 + 116667
    const igst = Math.round(taxable * 0.18)
    const s = summarize(lines, taxable, { cgst: 0, sgst: 0, igst, total: taxable + igst })
    expect(s.rows.map((r) => r.group)).toEqual(['plan', 'apps', 'fees', 'credits'])
    expect(s.rows[0]!.taxable).toBe(499900 + 116667)
    expect(s.beforeGst).toBe(taxable)
    expect(s.adds).toBe(true)
  })

  it('a summary that does not reconcile says so', () => {
    const s = summarize([line('plan', 499900)], 500000, { cgst: 0, sgst: 0, igst: 90000, total: 590000 })
    expect(s.adds).toBe(false)
  })

  it('delivered sales are billed bases less credited bases, never negative', () => {
    expect(deliveredSales([{ base: 249000 }, { base: 129900 }], [{ base: 129900 }])).toBe(249000)
    expect(deliveredSales([], [{ base: 100 }])).toBe(0)
  })

  it('a credit takes back the whole base when the order came back, only the returned part for a return', () => {
    expect(creditedBase({ kind: 'outcome', fee: 2490, base: 249000, feeBps: 100 })).toBe(249000)
    expect(creditedBase({ kind: 'return', fee: 899, base: 249000, feeBps: 100 })).toBe(89900)
    expect(creditedBase({ kind: 'return', fee: 99999, base: 249000, feeBps: 100 })).toBe(249000)
  })

  it('cost share in basis points; none without sales', () => {
    expect(costShareBps(683900, 18400000)).toBe(372)
    expect(costShareBps(1, 0)).toBeNull()
  })

  it('a plan at a sales figure costs its price plus deliveredFee, with the same rounding', () => {
    const sales = 18400033 as Paise
    for (const p of PLANS) expect(planCostAt(sales, p)).toBe(p.monthlyPrice + deliveredFee(sales, p.feeBps))
    expect(planCostAt(18400000 as Paise, PLANS[0]!)).toBe(517900)
  })

  it('the cheapest plan at a figure: Launch below ₹3.5 lakh, Growth above, Scale above ₹20 lakh', () => {
    expect(cheapestAt(34000000 as Paise, PLANS)?.code).toBe('launch')
    expect(cheapestAt(36000000 as Paise, PLANS)?.code).toBe('growth')
    expect(cheapestAt(210000000 as Paise, PLANS)?.code).toBe('scale')
    expect(cheapestAt(0 as Paise, [])).toBeNull()
  })

  it('a cost bar: plan and apps together, fees less credits, carry left out', () => {
    expect(costBar([line('plan', 499900), line('addon', 49900), line('fee', 184000), line('credit', -2190), line('carry', 5000)]))
      .toEqual({ plan: 549800, fees: 181810 })
  })
})
