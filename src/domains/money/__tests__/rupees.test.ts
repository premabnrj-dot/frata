import { describe, expect, it } from 'vitest'
import { parseRupees, rupeesText } from '../rupees'

describe('parseRupees', () => {
  it('reads a price however it is dressed', () => {
    for (const [text, paise] of [
      ['1299', 129900], ['₹1,299', 129900], ['₹ 1,299', 129900], ['Rs 1299', 129900], ['Rs. 1299', 129900], ['rs.1299', 129900],
      ['INR 1,299.00', 129900], ['1299 INR', 129900], ['1299₹', 129900], ['1,299/-', 129900], ['₹1,299.50/-', 129950], ['Rs. 1,299 /-', 129900],
      ['1299.00', 129900], ['2490.5', 249050], ['0.50', 50], ['  999  ', 99900],
      ['1,00,000', 10000000], ['12,34,567', 123456700], ['100,000', 10000000], ['1,000,000', 100000000], ['99,99,999', 999999900],
    ] as const) expect(parseRupees(text), text).toBe(paise)
  })
  it('refuses what is not a price: misplaced commas, three decimals, zero, negatives, words, too much', () => {
    for (const text of ['', 'Rs', '1,2,99', '12,99', '1,29,9', ',1299', '1299,', '1,,299', '999.999', '1299.', '.50', '0', '0.00', '₹0',
      '-1299', '−1299', '(1299)', '1 299', '12OO', 'free', '1299 only', '1,00,00,000', '10000000', '1e3', '0x10'])
      expect(parseRupees(text), text).toBeNull()
  })
  it('takes a zero only when asked (a cost may be nothing)', () => {
    expect(parseRupees('0', { zero: true })).toBe(0)
    expect(parseRupees('₹0.00', { zero: true })).toBe(0)
    expect(parseRupees('-0', { zero: true })).toBeNull()
  })
  it('writes paise back as a price box shows it', () => {
    expect(rupeesText(249050)).toBe('2490.50'); expect(rupeesText(249000)).toBe('2490'); expect(rupeesText(5)).toBe('0.05'); expect(rupeesText(null)).toBe('')
    for (const p of [1, 99, 100, 129950, 999999900]) expect(parseRupees(rupeesText(p))).toBe(p)
  })
})
