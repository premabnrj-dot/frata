import { describe, expect, it } from 'vitest'
import { invoiceState } from '../status'
import { csvCell, gstCsv } from '../document'

describe('invoice state (billing B2)', () => {
  const issued = { issuedAt: new Date(), number: 'FRR/26-27/000001', total: 180927 }
  it('is derived from payments and credits', () => {
    expect(invoiceState({ ...issued, issuedAt: null, number: null }, 0, 0).state).toBe('draft')
    expect(invoiceState({ ...issued, number: null }, 0, 0)).toEqual({ state: 'closed', due: 0 })
    expect(invoiceState(issued, 0, 0)).toEqual({ state: 'due', due: 180927 })
    expect(invoiceState(issued, 100000, 0)).toEqual({ state: 'due', due: 80927 })
    expect(invoiceState(issued, 100000, 80927)).toEqual({ state: 'paid', due: 0 })
    expect(invoiceState(issued, 0, 180927)).toEqual({ state: 'credited', due: 0 })
  })
})

describe('GST export', () => {
  it('neutralises formulas and quotes, and signs credit notes negative', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('@SUM')).toBe(`"'@SUM"`)
    expect(csvCell(-12)).toBe('"-12"')
    const csv = gstCsv([{ type: 'Credit note', number: 'FRR/26-27/C00001', date: new Date('2026-12-05T00:00:00Z'), against: 'FRR/26-27/000001', buyer: '+Kesar', gstin: '', placeOfSupply: '08', taxable: 10000, cgst: 900, sgst: 900, igst: 0, total: 11800 }], () => '05-12-2026')
    expect(csv.split('\r\n')[1]).toBe(`"Credit note","FRR/26-27/C00001","05-12-2026","FRR/26-27/000001","'+Kesar","","08","-100.00","-9.00","-9.00","0.00","-118.00"`)
  })
})
