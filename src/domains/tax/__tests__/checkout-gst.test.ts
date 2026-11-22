import { describe, expect, it } from 'vitest'
import { checkoutGst } from '../gstin'

// One-address P2·2/P2·3: a regular GSTIN means a GST invoice on every order (checkout's trust block).
describe('checkoutGst', () => {
  const base = { gstin: '29ABCDE1234F1Z5', gstScheme: 'regular', homeState: null, b2bInvoices: true, turnoverBand: 'under_5cr' }
  it('a regular GSTIN: invoices, no state limit, business invoices when asked', () => {
    expect(checkoutGst(base)).toEqual({ deliversWithin: null, b2b: true, invoice: true })
  })
  it('composition or no GSTIN: no GST invoice, delivery within the state', () => {
    expect(checkoutGst({ ...base, gstScheme: 'composition' })).toMatchObject({ b2b: false, invoice: false })
    expect(checkoutGst({ ...base, gstin: null, homeState: '29' })).toMatchObject({ b2b: false, invoice: false })
  })
})
