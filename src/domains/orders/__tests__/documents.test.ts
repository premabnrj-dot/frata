import { describe, expect, it } from 'vitest'
import { taxOrder } from '@/domains/tax/gst'
import { addressLines, invoice, packingSlip, type DocLine, type DocOrder } from '../documents'

const gross = [{ gross: 249000, unitPrice: 249000, hsn: '6211' }, { gross: 320000, unitPrice: 320000, hsn: '6211' }]
const t = taxOrder(gross, 7900 + 4900, { registered: true, pricesIncludeGst: true })
const lines: DocLine[] = t.lines.map((l, i) => ({
  taxableValue: l.taxable, gst: l.gst, gstBps: l.bps, chargeTaxable: l.chargeTaxable, chargeGst: l.chargeGst,
  title: ['Chanderi kurta set', 'Silk kurta'][i]!, optionValues: ['M', 'Rust'], qty: 1, sku: `KS-${i}`, hsn: '6211', imageBase: null, imageWidths: null,
}))
const gstTotal = t.lines.reduce((a, l) => a + l.gst, 0) + t.chargesGst
const order = (o: Partial<DocOrder> = {}): DocOrder => ({
  paymentMethod: 'cod', paidAt: null, switchedToCodAt: null, cancelledAt: null, subtotal: 569000, shipping: 7900, codCharge: 4900, gstTotal, total: 581800, pricesIncludeGst: true,
  number: 'KS-1001', placedAt: new Date('2026-11-07T05:00:00Z'), packedAt: new Date('2026-11-07T09:00:00Z'), invoiceNumber: 'KS/26-27/00001', sellerGstin: '08AAAAA0000A1Z5',
  customerName: 'Ananya Sharma', phone: '9829043210', addressLine: 'B-14, Tilak Marg', area: 'C-Scheme', landmark: '', city: 'Jaipur', pincode: '302001', state: 'Rajasthan', supplyState: 'Rajasthan', ...o,
})
const shop = { name: 'Kesar Studio', legalName: 'Kesar Studio LLP', address: 'Jaipur', returnAddress: '' }

describe('the invoice', () => {
  it('adds up to the order: taxable + GST = total, GST = what checkout charged', () => {
    const inv = invoice(order(), lines, shop)!
    expect(inv.kind).toBe('tax_invoice')
    expect(inv.totals.total).toBe(581800)
    expect(inv.totals.cgst + inv.totals.sgst + inv.totals.igst).toBe(gstTotal)
    expect(inv.lines.map((l) => l.rateBps)).toEqual([500, 1800])
  })
  it('same state: CGST + SGST; another state: IGST — by state code', () => {
    expect(invoice(order(), lines, shop)!.supply).toBe('intra')
    const other = invoice(order({ supplyState: 'Maharashtra' }), lines, shop)!
    expect(other.supply).toBe('inter')
    expect(other.totals.cgst + other.totals.sgst).toBe(0)
    expect(other.placeOfSupply).toEqual({ state: 'Maharashtra', code: '27' })
  })
  it('no GSTIN when placed: a bill of supply, no tax lines; nothing before packing; a cancel is shown, the number kept', () => {
    const bill = invoice(order({ sellerGstin: null, invoiceNumber: 'KS/26-27/B0001' }), lines, shop)!
    expect(bill.kind).toBe('bill_of_supply')
    expect(bill.lines.every((l) => l.cgst + l.sgst + l.igst === 0 && l.rateBps === 0)).toBe(true)
    expect(invoice(order({ packedAt: null, invoiceNumber: null }), lines, shop)).toBe(null)
    expect(invoice(order({ cancelledAt: new Date() }), lines, shop)).toMatchObject({ cancelled: true, number: 'KS/26-27/00001' })
  })
  it('an order placed before 1D (no stored shares) prints the same figures', () => {
    const old = lines.map((l) => ({ ...l, chargeTaxable: null, chargeGst: null }))
    expect(invoice(order(), old, shop)!.totals).toEqual(invoice(order(), lines, shop)!.totals)
  })
})

describe('the packing slip', () => {
  it('collect the total on COD; nothing when paid online, paid after a switch, or cancelled; no prices', () => {
    expect(packingSlip(order(), lines, shop).collect).toBe(581800)
    expect(packingSlip(order({ paymentMethod: 'prepaid', paidAt: new Date() }), lines, shop).collect).toBe(0)
    expect(packingSlip(order({ paymentMethod: 'prepaid', switchedToCodAt: new Date(), paidAt: new Date() }), lines, shop).collect).toBe(0)
    expect(JSON.stringify(packingSlip(order(), lines, shop).lines)).not.toMatch(/price|249000/)
  })
  it('prints the address whether or not the area was kept apart', () => {
    expect(addressLines(order())).toEqual(['B-14, Tilak Marg, C-Scheme', 'Jaipur 302001', 'Rajasthan'])
    expect(addressLines(order({ addressLine: 'B-14, Tilak Marg, C-Scheme', area: '' }))[0]).toBe('B-14, Tilak Marg, C-Scheme')
  })
})
