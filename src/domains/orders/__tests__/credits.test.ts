import { describe, expect, it } from 'vitest'
import { creditDeadline, creditOpen, discountCredit, leftOf, restockOf, returnCredit, reversalCredit, type InvoicedLine, type SoldLine, type Taken } from '../credits'

// Two kurtas at ₹2,490 incl. 5% (₹4,980: taxable 4742.86, GST 237.14) and a jhumka at ₹690 incl. 3%; ₹79 delivery shared.
const L: InvoicedLine[] = [
  { lineId: 'a', qty: 2, taxable: 474286, gst: 23714, chargeTaxable: 6941, chargeGst: 347, bps: 500 },
  { lineId: 'b', qty: 1, taxable: 66990, gst: 2010, chargeTaxable: 597, chargeGst: 15, bps: 300 },
]
const take = (lines: { lineId: string; qty: number; taxable: number; gst: number }[]): Taken[] => lines

describe('credit notes: what is left, never more', () => {
  it('a part return: one of two kurtas, the goods only, at the invoice rate', () => {
    const r = returnCredit(L, [], { a: 1 })
    expect(r).toEqual({ ok: true, lines: [{ lineId: 'a', qty: 1, taxable: 237143, gst: 11857, bps: 500 }] })
  })
  it('the second unit takes the remainder: two part returns add up to the line exactly', () => {
    const one = returnCredit(L, [], { a: 1 }); if (!one.ok) throw new Error()
    const two = returnCredit(L, take(one.lines), { a: 1 }); if (!two.ok) throw new Error()
    expect(one.lines[0]!.taxable + two.lines[0]!.taxable).toBe(474286)
    expect(one.lines[0]!.gst + two.lines[0]!.gst).toBe(23714)
    expect(returnCredit(L, take([...one.lines, ...two.lines]), { a: 1 })).toMatchObject({ ok: false })
  })
  it('refuses more than invoiced, a line not on it, or nothing', () => {
    expect(returnCredit(L, [], { a: 3 })).toMatchObject({ ok: false, error: expect.stringMatching(/At most 2/) })
    expect(returnCredit(L, [], { z: 1 })).toMatchObject({ ok: false })
    expect(returnCredit(L, [], {})).toMatchObject({ ok: false })
    expect(returnCredit(L, [], { a: 1.5 })).toMatchObject({ ok: false })
  })
  it('a pre-agreed discount after the sale: shared by value, split at each rate, sums to the amount', () => {
    const r = discountCredit(L, [], 30000, true); if (!r.ok) throw new Error()
    expect(r.lines.reduce((a, l) => a + l.taxable + l.gst, 0)).toBe(30000)
    expect(r.lines.map((l) => l.bps)).toEqual([500, 300])
    expect(discountCredit(L, [], 10_000_000, true)).toMatchObject({ ok: false, error: expect.stringMatching(/At most/) })
    expect(discountCredit(L, [], 0, true)).toMatchObject({ ok: false })
  })
  it('a reversal after a part return credits only what is left, delivery included', () => {
    const one = returnCredit(L, [], { a: 1 }); if (!one.ok) throw new Error()
    const rev = reversalCredit(L, take(one.lines))
    const all = [...one.lines, ...rev]
    const invoiceTotal = L.reduce((a, l) => a + l.taxable + l.gst + l.chargeTaxable + l.chargeGst, 0)
    expect(all.reduce((a, l) => a + l.taxable + l.gst, 0)).toBe(invoiceTotal)
    expect(reversalCredit(L, take(all))).toEqual([])
    expect(leftOf(L, take(all)).every((l) => l.qtyLeft === 0 && l.taxableLeft === 0 && l.gstLeft === 0)).toBe(true)
  })
  it('stress: 500 random sequences of returns and discounts never credit more than the invoice', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (let n = 0; n < 500; n++) {
      const lines: InvoicedLine[] = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) => {
        const qty = 1 + Math.floor(rnd() * 5), bps = [0, 300, 500, 1800][Math.floor(rnd() * 4)]!
        const gross = qty * (10_000 + Math.floor(rnd() * 600_000)), taxable = Math.round((gross * 10_000) / (10_000 + bps))
        return { lineId: `l${i}`, qty, taxable, gst: gross - taxable, chargeTaxable: Math.floor(rnd() * 5000), chargeGst: Math.floor(rnd() * 500), bps }
      })
      let taken: Taken[] = []
      for (let step = 0; step < 6; step++) {
        if (rnd() < 0.5) {
          const l = lines[Math.floor(rnd() * lines.length)]!
          const r = returnCredit(lines, taken, { [l.lineId]: 1 + Math.floor(rnd() * 2) })
          if (r.ok) taken = [...taken, ...r.lines]
        } else {
          const r = discountCredit(lines, taken, 100 + Math.floor(rnd() * 200_000), rnd() < 0.5)
          if (r.ok) taken = [...taken, ...r.lines]
        }
      }
      taken = [...taken, ...reversalCredit(lines, taken)]
      for (const l of leftOf(lines, taken)) { expect(l.taxableLeft).toBeGreaterThanOrEqual(0); expect(l.gstLeft).toBeGreaterThanOrEqual(0); expect(l.qtyLeft).toBeGreaterThanOrEqual(0) }
      const credited = taken.reduce((a, t) => a + t.taxable + t.gst, 0)
      expect(credited).toBe(lines.reduce((a, l) => a + l.taxable + l.gst + l.chargeTaxable + l.chargeGst, 0))
    }
  })
  it('the time limit: 30 November after the invoice’s financial year, in IST', () => {
    expect(creditDeadline(new Date('2026-11-04T06:00:00Z')).toISOString()).toBe('2027-11-30T18:29:59.999Z')
    expect(creditDeadline(new Date('2027-03-31T18:00:00Z')).toISOString()).toBe('2027-11-30T18:29:59.999Z') // 31 Mar 23:30 IST: FY 26-27
    expect(creditDeadline(new Date('2027-03-31T18:31:00Z')).toISOString()).toBe('2028-11-30T18:29:59.999Z') // 1 Apr 00:01 IST: FY 27-28
    expect(creditOpen(new Date('2026-11-04T06:00:00Z'), new Date('2027-11-30T18:00:00Z'))).toBe(true)
    expect(creditOpen(new Date('2026-11-04T06:00:00Z'), new Date('2027-11-30T18:30:00Z'))).toBe(false)
  })
})

describe('a return back in stock (restockOf): each piece once, never more than sold', () => {
  const sold: SoldLine[] = [{ lineId: 'a', qty: 2, stocked: true }, { lineId: 'b', qty: 1, stocked: true }]
  it('puts back the credited quantity of each line', () => {
    const r = returnCredit(L, [], { a: 1, b: 1 }); if (!r.ok) throw new Error()
    expect(restockOf(r.lines, sold, [])).toEqual({ a: 1, b: 1 })
  })
  it('counts what earlier notes put back: never above the line sold', () => {
    const one = returnCredit(L, [], { a: 1 }); if (!one.ok) throw new Error()
    expect(restockOf(one.lines, sold, [{ lineId: 'a', restockedQty: 1 }])).toEqual({ a: 1 })
    // A line that earlier notes already put back in full: nothing more, whatever is asked.
    expect(restockOf([{ lineId: 'a', qty: 2, taxable: 1, gst: 0, bps: 500 }], sold, [{ lineId: 'a', restockedQty: 2 }])).toEqual({})
    expect(restockOf([{ lineId: 'a', qty: 2, taxable: 1, gst: 0, bps: 500 }], sold, [{ lineId: 'a', restockedQty: 1 }])).toEqual({ a: 1 })
  })
  it('nothing for a discount (no pieces), a line whose stock was never taken, or one not on the order', () => {
    const d = discountCredit(L, [], 50000, true); if (!d.ok) throw new Error()
    expect(restockOf(d.lines, sold, [])).toEqual({})
    expect(restockOf([{ lineId: 'a', qty: 1, taxable: 1, gst: 0, bps: 500 }], [{ lineId: 'a', qty: 2, stocked: false }], [])).toEqual({})
    expect(restockOf([{ lineId: 'z', qty: 1, taxable: 1, gst: 0, bps: 500 }], sold, [])).toEqual({})
  })
})
