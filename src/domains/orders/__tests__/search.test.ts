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
    expect(parseOrderSearch('+91 98290 43210')?.phoneDigits).toBe('919829043210')
    expect(parseOrderSearch('KS-1004')?.phoneDigits).toBe(null)
    expect(parseOrderSearch('123')?.phoneDigits).toBe(null)
  })
  it('wildcards and the escape character are matched as text', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
    expect(parseOrderSearch('a_b')?.like).toBe('%a\\_b%')
  })
  it('empty is no search; long input is cut', () => {
    expect(parseOrderSearch('   ')).toBe(null)
    expect(parseOrderSearch('x'.repeat(200))!.like.length).toBe(MAX_SEARCH + 2)
  })
})
