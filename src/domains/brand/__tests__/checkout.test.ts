import { describe, expect, it } from 'vitest'
import { DEFAULT_DESIGN, designChanges, checkoutProblems, designSummary, headingOf, readDesign, renderDesign, trustBlocks, trustOrder, trustWords, type CheckoutDesign, type TrustFacts } from '../checkout'
import { LINE_WORDS } from '../lines'

// House of Ayuda's test store (P2 mockup, 2026-11-16): dispatch 1, metro 3, elsewhere 6; 7-day exchange or returns;
// Pay on delivery up to ₹3,000; no regular GSTIN yet.
const AYUDA: TrustFacts = { dispatchDays: 1, metroDays: 3, restDays: 6, returnKind: 'exchange_or_refund', returnDays: 7, codOn: true, codMax: 300000, gstInvoice: false }
const drawn: CheckoutDesign = { header: 'left', back: true, rows: 1, trust: ['delivery', 'returns', 'cod', 'secure'], heading: 'Almost yours', thanks: 'We’re glad this one found you. For the days you’ll keep.' }

describe('trust blocks', () => {
  it('words each block from the store’s facts, as drawn', () => {
    expect(trustBlocks(drawn.trust, AYUDA).map((b) => b.words)).toEqual(['Delivered in 4–7 days', '7-day exchange or returns', 'Pay on delivery up to ₹3,000', 'Secure payment by Razorpay'])
  })
  it('drops a block whose fact is missing, keeping the order', () => {
    const f = { ...AYUDA, codOn: false, returnKind: 'none' as const }
    expect(trustBlocks(['cod', 'secure', 'returns', 'delivery'], f).map((b) => b.key)).toEqual(['secure', 'delivery'])
  })
  it('names the GST invoice only for a regular GSTIN', () => {
    expect(trustWords('gst', AYUDA)).toBeNull()
    expect(trustWords('gst', { ...AYUDA, gstInvoice: true })).toBe('GST invoice on every order')
  })
  it('says the returns kind and the COD limit as settings hold them', () => {
    expect(trustWords('returns', { ...AYUDA, returnKind: 'exchange_only' })).toBe('7-day exchanges')
    expect(trustWords('returns', { ...AYUDA, returnKind: 'refund_only', returnDays: 10 })).toBe('10-day returns')
    expect(trustWords('cod', { ...AYUDA, codMax: 0 })).toBe('Pay on delivery')
    expect(trustWords('delivery', { ...AYUDA, metroDays: 0, restDays: 5 })).toBe('Delivered in 6 days')
    expect(trustWords('delivery', { ...AYUDA, restDays: 0 })).toBeNull()
  })
  it('follows Delivery Zones as checkout does: the zones’ days, no single Pay on delivery limit', () => {
    const zone = (daysMin: number, daysMax: number) => ({ name: 'Z', charge: 0, freeAbove: null, daysMin, daysMax, codOn: true, codCharge: 0, codMax: null })
    const z = { ...AYUDA, zones: [zone(2, 3), zone(4, 6)] }
    expect(trustWords('cod', z)).toBe('Pay on delivery')
    expect(trustWords('delivery', z)).toBe('Delivered in 3–7 days')
  })
  it('lists the blocks that are on first, then the rest (screen 8)', () => {
    expect(trustOrder(['cod', 'delivery'])).toEqual(['cod', 'delivery', 'returns', 'secure', 'gst'])
  })
})

describe('the check', () => {
  it('passes the drawn design and the default', () => {
    expect(checkoutProblems(drawn)).toEqual([]); expect(checkoutProblems(DEFAULT_DESIGN)).toEqual([])
  })
  it('refuses five trust blocks, a repeat and one off the set', () => {
    expect(checkoutProblems({ ...drawn, trust: ['delivery', 'returns', 'cod', 'secure', 'gst'] })[0]?.field).toBe('trust')
    expect(checkoutProblems({ ...drawn, trust: ['cod', 'cod'] })[0]?.field).toBe('trust')
    expect(checkoutProblems({ ...drawn, trust: ['tweet' as never] })[0]?.field).toBe('trust')
  })
  it('names each line’s refusal at its field (screen 9)', () => {
    const p = checkoutProblems({ ...drawn, heading: 'Almost yours, beautiful one', thanks: 'Thank you. For exchanges, pay the fee to ayuda@okicici.' })
    expect(p).toEqual([{ field: 'heading', message: 'Up to 24 characters.' }, { field: 'thanks', message: LINE_WORDS.upi }])
  })
  it('refuses a header or rows off the closed set', () => {
    expect(checkoutProblems({ ...drawn, header: 'right' as never }).map((x) => x.field)).toEqual(['header'])
    expect(checkoutProblems({ ...drawn, rows: 3 as never }).map((x) => x.field)).toEqual(['rows'])
  })
})

describe('render', () => {
  it('draws "Checkout" for an empty heading and nothing for an empty thank-you line (owner call 6)', () => {
    expect(headingOf(DEFAULT_DESIGN)).toBe('Checkout'); expect(headingOf(drawn)).toBe('Almost yours')
    expect(renderDesign(null)).toEqual(DEFAULT_DESIGN)
  })
  it('falls back part by part when a saved design fails a later rule', () => {
    const r = renderDesign({ ...drawn, thanks: 'Call 98000 00000', trust: ['cod', 'cod'] })
    expect(r.thanks).toBe(''); expect(r.trust).toEqual(DEFAULT_DESIGN.trust); expect(r.heading).toBe('Almost yours')
  })
})

describe('the owner’s line', () => {
  it('names what changed', () => {
    expect(designSummary(designChanges(drawn, { ...drawn, heading: 'Nearly yours' }))).toBe('The checkout heading.')
    expect(designSummary(designChanges(drawn, { ...drawn, back: false, heading: 'x', thanks: '' }))).toBe('The back link, the checkout heading and the thank-you line.')
    expect(designChanges(drawn, drawn)).toEqual([])
  })
  it('reads a stored design back, or null', () => {
    expect(readDesign(drawn)).toEqual(drawn); expect(readDesign({})).toBeNull(); expect(readDesign(null)).toBeNull()
    expect(readDesign({ ...drawn, trust: ['cod', 'x'] })?.trust).toEqual(['cod'])
  })
})
