import { describe, expect, it } from 'vitest'
import { readPins, readRulesCsv, rulesCsv } from '../lists'

describe('readPins', () => {
  it('6-digit codes and 3-digit prefixes, deduplicated; the rest named', () => {
    expect(readPins('302001, 302 302001\n303')).toEqual({ pins: ['302001', '302', '303'], bad: [] })
    expect(readPins('3020, 012345, abc').bad).toEqual(['3020', '012345', 'abc'])
  })
})

describe('readRulesCsv', () => {
  it('reads the three rules, rupees to paise, notes cleaned and capped', () => {
    const r = readRulesCsv('pincode,rule,cod_max,note\n110094,prepaid_only,,7 of 11 came back\n744101,no_delivery,,\n400070,cod_max,"1,500",' + 'x'.repeat(200))
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([
      { pincode: '110094', rule: 'prepaid_only', codMax: null, note: '7 of 11 came back' },
      { pincode: '744101', rule: 'no_delivery', codMax: null, note: null },
      { pincode: '400070', rule: 'cod_max', codMax: 150000, note: 'x'.repeat(120) },
    ])
  })
  it('names each bad line; a wrong header refuses the file; the last row for a PIN code wins', () => {
    const r = readRulesCsv('pincode,rule\n12345,no_delivery\n302001,maybe\n302002,cod_max,\n302003,no_delivery\n302003,prepaid_only')
    expect(r.errors).toEqual(['Line 2: "12345" is not a 6-digit PIN code.', 'Line 3: the rule must be no_delivery, prepaid_only or cod_max.', 'Line 4: cod_max needs an amount in rupees.'])
    expect(r.rows).toEqual([{ pincode: '302003', rule: 'prepaid_only', codMax: null, note: null }])
    expect(readRulesCsv('pin,what\n302001,no_delivery').errors).toEqual(['The first line must be: pincode,rule,cod_max,note'])
  })
  it('refuses a file over 256 KB before reading it', () => {
    expect(readRulesCsv('pincode,rule\n' + '302001,no_delivery\n'.repeat(15000)).errors[0]).toMatch(/over 256 KB/)
  })
  it('the export reads back the same, formula-safe', () => {
    const rows = [{ pincode: '110094', rule: 'cod_max' as const, codMax: 150000, note: '=HYPERLINK("x")' }]
    const text = rulesCsv(rows)
    expect(text).toContain("'=HYPERLINK")
    expect(readRulesCsv(text).rows).toEqual(rows)
  })
})
