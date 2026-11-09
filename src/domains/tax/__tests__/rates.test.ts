import { describe, expect, it } from 'vitest'
import { b2bAllowed, hsnDigitsFor, inGap, rateOn, ruleOn, ruleWords, searchHsn, tableOn, RATE_TABLES } from '../rates'
import { b2bProblem, gstinStateName, gstinValid } from '../gstin'
import { chargesGst, taxOrder } from '../gst'

const D = new Date('2026-11-09T06:00:00Z')

describe('the rate table (GST 2.0)', () => {
  it('the ₹2,500 slab for apparel, made-ups and footwear, on the taxable value of a piece', () => {
    for (const hsn of ['6204', '620442', '61091000', '6302', '6403']) {
      expect(rateOn(hsn, 250000, false, D)).toBe(500)
      expect(rateOn(hsn, 250001, false, D)).toBe(1800)
      expect(rateOn(hsn, 262500, true, D)).toBe(500) // ₹2,500.00 at 5%
      expect(rateOn(hsn, 262501, true, D)).toBe(1800)
    }
  })
  it('flat rates by code; the longest prefix wins', () => {
    expect(rateOn('4202', 99900, true, D)).toBe(1800)
    expect(rateOn('7117', 99900, true, D)).toBe(300)
    expect(rateOn('711319', 9_999_900, true, D)).toBe(300)
    expect(rateOn('5007', 999_900, true, D)).toBe(500) // a silk saree: fabric, 5% at any price
    expect(rateOn('3401', 19900, true, D)).toBe(500)
    expect(rateOn('3304', 49900, true, D)).toBe(1800)
  })
  it('an unknown code is never guessed: the merchant’s own rate, else none', () => {
    expect(ruleOn('2106', D)).toBeNull()
    expect(rateOn('2106', 49900, true, D)).toBeNull()
    expect(rateOn('2106', 49900, true, D, 500)).toBe(500)
    expect(rateOn('7117', 49900, true, D, 1800)).toBe(300) // the table wins over a stray own rate
    expect(rateOn(null, 49900, true, D)).toBeNull()
    expect(rateOn('62', 49900, true, D)).toBeNull() // fewer than 4 digits is not a code
  })
  it('the inclusive-price gap: ₹2,625.01–₹2,950 fits no slab rate, and the console can say so', () => {
    expect(inGap('6204', 262500, true, D)).toBeNull()
    expect(inGap('6204', 279000, true, D)).toEqual({ below: 262500, above: 295100 })
    expect(inGap('6204', 295000, true, D)).not.toBeNull()
    expect(inGap('6204', 295001, true, D)).toBeNull()
    expect(inGap('6204', 279000, false, D)).toBeNull() // prices without GST have no gap
    expect(inGap('4202', 279000, true, D)).toBeNull() // flat rates have none
    expect(rateOn('6204', 279000, true, D)).toBe(1800) // tested at 5%: over ₹2,500, so 18%
  })
  it('a dated table: a date before every table reads the oldest; each table has a from date', () => {
    expect(tableOn(new Date('2020-01-01')).from).toBe(RATE_TABLES[RATE_TABLES.length - 1]!.from)
    for (const t of RATE_TABLES) expect(t.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('every listed code is 2, 4, 6 or 8 digits, with a name and a rate a GST 2.0 slab allows', () => {
    for (const t of RATE_TABLES) for (const e of t.entries) {
      expect(e.code).toMatch(/^(\d{2}|\d{4}|\d{6}|\d{8})$/)
      expect(e.name.length).toBeGreaterThan(3)
      const bps = e.rule.kind === 'flat' ? [e.rule.bps] : [e.rule.low, e.rule.high]
      for (const b of bps) expect([0, 300, 500, 1800, 4000]).toContain(b)
    }
  })
  it('search by words or code', () => {
    expect(searchHsn('kurta', D)[0]!.code).toMatch(/^62/)
    expect(searchHsn('jhumka', D)[0]!.code).toBe('7117')
    expect(searchHsn('4202', D)[0]!.code).toBe('4202')
    expect(searchHsn('saree', D).map((e) => e.code)).toContain('5007')
    expect(searchHsn('zzzz', D)).toEqual([])
    expect(ruleWords(ruleOn('6204', D)!)).toBe('5% up to ₹2,500 a piece, 18% above')
  })
  it('turnover band: HSN digits and business invoices', () => {
    expect(hsnDigitsFor('under_5cr')).toBe(4); expect(hsnDigitsFor('over_10cr')).toBe(6)
    expect(b2bAllowed('under_5cr')).toBe(true); expect(b2bAllowed('5_to_10cr')).toBe(false)
  })
})

describe('who charges GST', () => {
  it('regular charges; composition and not registered don’t', () => {
    expect(chargesGst({ gstin: '08ABCDE1234F1Z5', scheme: 'regular' })).toBe(true)
    expect(chargesGst({ gstin: '08ABCDE1234F1Z5', scheme: 'composition' })).toBe(false)
    expect(chargesGst({ gstin: null, scheme: 'regular' })).toBe(false)
    expect(chargesGst({ gstin: '08ABCDE1234F1Z5', scheme: null })).toBe(true)
  })
  it('a line priced at the date the order was placed (the rate the shopper saw)', () => {
    const t = taxOrder([{ gross: 249000, unitPrice: 249000, hsn: '6204' }, { gross: 69000, unitPrice: 69000, hsn: '7117' }], 0, { registered: true, pricesIncludeGst: true, date: D })
    expect(t.lines.map((l) => l.bps)).toEqual([500, 300])
    expect(t.lines[1]!.taxable + t.lines[1]!.gst).toBe(69000)
  })
})

describe('a business buyer at checkout', () => {
  const ok = '29ABCDE1234F1Z5'
  it('the checksum', () => {
    const good = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => '08ABCDE1234F1Z' + c).filter(gstinValid)
    expect(good).toHaveLength(1)
    expect(gstinValid(good[0]!.slice(0, 14) + (good[0]!.endsWith('0') ? '1' : '0'))).toBe(false)
  })
  it('the GSTIN’s state must be the delivery state', () => {
    const valid = ['27AAICA1234F1Z', '29ABCDE1234F1Z'].map((p) => { for (const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (gstinValid(p + c)) return p + c; return '' })
    expect(gstinStateName(valid[0]!)).toBe('Maharashtra')
    expect(b2bProblem(valid[0]!, 'Aarna Boutique', 'Karnataka')).toMatchObject({ field: 'gstin', error: expect.stringMatching(/Maharashtra/) })
    expect(b2bProblem(valid[0]!, 'Aarna Boutique', 'Maharashtra')).toBeNull()
    expect(b2bProblem(valid[1]!, 'x', 'Karnataka')).toMatchObject({ field: 'name' })
    expect(b2bProblem('29ABCDE1234F1Z0', 'Studio', 'Karnataka')).toMatchObject({ field: 'gstin' })
    expect(ok.length).toBe(15)
  })
})
