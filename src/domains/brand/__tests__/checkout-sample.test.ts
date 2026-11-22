import { describe, expect, it } from 'vitest'
import { PREVIEW_STATES, sampleCheckout, type SampleItem, type SampleRules } from '../checkout-sample'

// The preview's sample checkout (one-address P2·5) is priced by checkout's own rules on the store's own products.
const SAGE: SampleItem = { title: 'Sage Floral Kurta Set', size: 'M', price: 279000, photo: null }
const LEMON: SampleItem = { title: 'Lemon Chikankari Kurti', size: 'S', price: 169000, photo: null }
const AYUDA: SampleRules = { shippingFlat: 7900, freeShippingAbove: 199900, codOn: true, codMin: 0, codMax: 300000, codCharge: 0 }

describe('sampleCheckout', () => {
  it('draws every state the preview lists, and nothing with no product', () => {
    for (const [s] of PREVIEW_STATES) expect(sampleCheckout([SAGE, LEMON], AYUDA, s)).not.toBeNull()
    expect(sampleCheckout([], AYUDA, 'ready')).toBeNull()
  })
  it('ready: one line, free delivery above the threshold, Pay on delivery chosen', () => {
    expect(sampleCheckout([SAGE], AYUDA, 'ready')).toMatchObject({ subtotal: 279000, shipping: 0, total: 279000, cod: true, method: 'cod', changed: null })
    expect(sampleCheckout([LEMON], AYUDA, 'ready')).toMatchObject({ shipping: 7900, total: 176900 })
  })
  it('not offered: two lines over the limit, in today’s words; with one product, two of it', () => {
    const c = sampleCheckout([SAGE, LEMON], AYUDA, 'nocod')!
    expect(c).toMatchObject({ total: 448000, cod: false, method: 'prepaid', codWhy: 'Pay on delivery is for orders up to ₹3,000. Pay online for this bag.' })
    expect(sampleCheckout([SAGE], AYUDA, 'nocod')!.lines.map((l) => l.qty)).toEqual([1, 2])
    expect(sampleCheckout([LEMON], { ...AYUDA, codMax: 0 }, 'nocod')!.codWhy).toBe('This shop does not take Pay on delivery.')
  })
  it('a sold-out line is drawn but not priced; a changed price says so; a failed payment is online', () => {
    const s = sampleCheckout([SAGE, LEMON], AYUDA, 'sold')!
    expect(s.lines.map((l) => l.soldOut)).toEqual([false, true]); expect(s.subtotal).toBe(279000)
    expect(sampleCheckout([SAGE], AYUDA, 'changed')!.changed).toBe('Something changed since you looked: Sage Floral Kurta Set: ₹2,790 → ₹2,890. Check the total and place the order again.')
    expect(sampleCheckout([SAGE], AYUDA, 'failed')).toMatchObject({ failed: true, method: 'prepaid' })
  })
  it('a Pay on delivery fee is in the total only when Pay on delivery is chosen', () => {
    expect(sampleCheckout([SAGE], { ...AYUDA, codCharge: 4900 }, 'ready')!.total).toBe(283900)
    expect(sampleCheckout([SAGE], { ...AYUDA, codCharge: 4900 }, 'failed')!.total).toBe(279000)
  })
})
