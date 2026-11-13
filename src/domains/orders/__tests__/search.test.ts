import { describe, expect, it } from 'vitest'
import { escapeLike, MAX_SEARCH, parseOrderSearch } from '../search'

describe('order search', () => {
  it('an order number, with or without its letters', () => {
    expect(parseOrderSearch('KS-1012')?.number).toBe(1012)
    expect(parseOrderSearch('ks 1012')?.number).toBe(1012)
    expect(parseOrderSearch('1012')?.number).toBe(1012)
    expect(parseOrderSearch('Ananya')?.number).toBe(null)
  })
  it('phones match on digits typed alone, never on an order number with letters', () => {
    expect(parseOrderSearch('43210')?.phoneDigits).toBe('43210')
    expect(parseOrderSearch('+91 98290 43210')?.phoneDigits).toBe('9829043210') // as stored (cleanMobile)
    expect(parseOrderSearch('KS-1004')?.phoneDigits).toBe(null)
    expect(parseOrderSearch('123')?.phoneDigits).toBe(null)
  })
  it('wildcards and the escape character are matched as text', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
    expect(parseOrderSearch('a_b')?.like).toBe('%a\\_b%')
  })
  it('empty is no search; long input is cut', () => {
    expect(parseOrderSearch('   ')).toBe(null)
    expect(parseOrderSearch('x'.repeat(200))!.like!.length).toBe(MAX_SEARCH + 2)
  })
})

describe('a phone pasted from WhatsApp (shop stress test 2026-11-11)', () => {
  it('drops +91, 91 or a leading 0 in front of a full number, as phones are stored', () => {
    for (const q of ['+91 98765 43210', '919876543210', '098765 43210', '(+91) 98765-43210', '98765 43210']) {
      expect(parseOrderSearch(q)?.phoneDigits, q).toBe('9876543210')
    }
  })
  it('a part of a number is searched as typed', () => {
    expect(parseOrderSearch('43210')?.phoneDigits).toBe('43210')
    expect(parseOrderSearch('0987')?.phoneDigits).toBe('0987')
  })
})

describe('which test runs (N1c: a fast test never waits on the name scan)', () => {
  it('digits are a number, a phone and a tracking number, never a name', () => {
    expect(parseOrderSearch('9845')).toEqual({ like: null, number: 9845, phoneDigits: '9845', awb: null })
    expect(parseOrderSearch('14900233812')).toMatchObject({ like: null, awb: '14900233812' })
  })
  it('an order number is not a name', () => expect(parseOrderSearch('KS-1012')?.like).toBe(null))
  it('letters and digits, 8 or more: a tracking number', () => {
    expect(parseOrderSearch('SF123456789IN')).toMatchObject({ like: null, awb: 'SF123456789IN', number: null })
  })
  it('a name is only a name', () => expect(parseOrderSearch('Sneha')).toEqual({ like: '%Sneha%', number: null, phoneDigits: null, awb: null }))
})
