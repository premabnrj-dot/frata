import { describe, expect, it } from 'vitest'
import { fitKey, shownQuote } from '../fitted'

const bag = [{ variantId: 'v1', qty: 1 }]

describe('the price checkout shows after a "changed" (shop stress test 2026-11-11)', () => {
  it('keeps the placement quote for the same bag, phone, pincode and code', () => {
    const key = fitKey(bag, '98765 43210', '302021', null)
    expect(shownQuote({ key, quote: 'placement' }, fitKey(bag, '+91 98765 43210', '302021', null), 'bag')).toBe('placement')
  })
  it('goes back to the bag quote when any of them changes', () => {
    const key = fitKey(bag, '9876543210', '302021', null)
    const fitted = { key, quote: 'placement' }
    expect(shownQuote(fitted, fitKey([{ variantId: 'v1', qty: 2 }], '9876543210', '302021', null), 'bag')).toBe('bag')
    expect(shownQuote(fitted, fitKey(bag, '9876543211', '302021', null), 'bag')).toBe('bag')
    expect(shownQuote(fitted, fitKey(bag, '9876543210', '302022', null), 'bag')).toBe('bag')
    expect(shownQuote(fitted, fitKey(bag, '9876543210', '302021', 'RIYA10'), 'bag')).toBe('bag')
    expect(shownQuote(null, key, 'bag')).toBe('bag')
  })
})
