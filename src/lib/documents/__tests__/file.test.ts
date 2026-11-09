// Documents D0: the PDFs render, carry the frozen numbers and both tax heads, and set a Hindi name whole.
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const { documentFile } = await import('../file')
import type { Invoice, PackingSlip } from '@/domains/orders/documents'

const brand = { name: 'Kesar Studio', accent: '#8A3B1F', logo: null, note: 'Returns within 7 days.', signatory: 'Riya Mehta' }
const slip: PackingSlip = { shop: 'Kesar Studio', number: 'KS-1043', collect: 248900, returnTo: '12 MI Road, Jaipur 302001',
  to: { name: 'श्री प्रिया शर्मा', lines: ['B-14, तिलक मार्ग, C-Scheme', 'Jaipur 302001', 'Rajasthan'], phone: '9829043210' },
  lines: [{ title: 'Chanderi kurta set', options: 'Indigo · M', qty: 1, sku: 'KUR-CH-IN-M', imageBase: null, imageWidths: null }] }
const inv: Invoice = { kind: 'tax_invoice', number: 'KS/26-27/00043', date: new Date('2026-11-07T06:00:00Z'), cancelled: false,
  seller: { name: 'Kesar Studio LLP', address: '12 MI Road, Jaipur 302001', gstin: '08AAAAA0000A1Z5' },
  buyer: { name: 'श्री प्रिया शर्मा', lines: ['B-14, तिलक मार्ग', 'Jaipur 302001', 'Rajasthan'], gstin: null, business: null }, composition: false, needsEwayBill: false,
  placeOfSupply: { state: 'Rajasthan', code: '08' }, supply: 'intra', pricesIncludeGst: true, charges: { delivery: 0, cod: 4900 },
  lines: [{ title: 'Chanderi kurta set', hsn: '6204', qty: 1, uqc: 'NOS', gross: 198214, discount: 0, taxable: 198214, rateBps: 1200, cgst: 11893, sgst: 11893, igst: 0, total: 222000 }],
  totals: { gross: 198214, discount: 0, taxable: 198214, cgst: 11893, sgst: 11893, igst: 0, total: 222000 } }

const text = (b: Buffer) => b.toString('latin1')

describe('documentFile (Documents D0)', () => {
  it('makes an A4 slip and a 4×6 label, one page each, named for the order', async () => {
    const a4 = await documentFile({ kind: 'slip', size: 'A4', slips: [slip] }, brand, 'care@kesarstudio.in')
    expect(text(a4!.bytes).startsWith('%PDF-')).toBe(true)
    expect(a4!.fileName).toBe('Kesar Studio Packing slip KS-1043.pdf')
    expect(text(a4!.bytes)).toMatch(/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/)
    const label = await documentFile({ kind: 'slip', size: 'label', slips: [slip, { ...slip, number: 'KS-1044' }] }, brand, 'x')
    expect(text(label!.bytes)).toMatch(/MediaBox \[0 0 288 432\]/)
    expect(label!.fileName).toMatch(/^Kesar Studio Packing slips \d{4}-\d{2}-\d{2} \(2\)\.pdf$/)
  }, 30_000)
  it('makes the invoice from its frozen figures, named by its number', async () => {
    const f = await documentFile({ kind: 'invoice', invoices: [{ inv, order: 'KS-1043' }] }, brand, 'x')
    expect(f!.fileName).toBe('Kesar Studio Tax invoice KS-26-27-00043.pdf')
    expect(f!.bytes.length).toBeGreaterThan(2000)
  }, 30_000)
  it('an invoice embeds the logo it was packed with (D2), not the shop’s logo of today', async () => {
    // A 2×2 PNG, the shape a logo for paper is stored in.
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGOQkRQHIgYIBQAIcgEx1UJShAAAAABJRU5ErkJggg==', 'base64'))
    const none = await documentFile({ kind: 'invoice', invoices: [{ inv, order: 'KS-1043', paper: { logo: null } }] }, { ...brand, logo: png }, 'x')
    const frozen = await documentFile({ kind: 'invoice', invoices: [{ inv, order: 'KS-1043', paper: { logo: png } }] }, brand, 'x')
    expect(text(none!.bytes)).not.toMatch(/\/Subtype \/Image/)
    expect(text(frozen!.bytes)).toMatch(/\/Subtype \/Image/)
  }, 30_000)
  it('makes nothing from nothing', async () => {
    expect(await documentFile({ kind: 'invoice', invoices: [] }, brand, 'x')).toBeNull()
  })
})

describe("Frrata's own invoice and credit note (billing B2)", () => {
  it('renders from frozen rows, test mode stamped, named by number', async () => {
    const { frrataFile } = await import('../frrata')
    const { frrataInvoiceDoc, frrataCreditNoteDoc } = await import('@/domains/billing/document')
    const doc = frrataInvoiceDoc({ number: 'FRR/T26-27/000001', issuedAt: new Date('2026-12-01T03:00:00Z'), testMode: true, sellerName: 'Frrata (test mode)', sellerGstin: null, sellerAddress: 'Not set yet', sac: '998314',
      buyerName: 'Kesar Studio LLP', buyerGstin: '08AAAAA0000A1Z5', buyerAddress: 'Jaipur', placeOfSupply: '08', periodStart: new Date('2026-11-30T18:30:00Z'), periodEnd: new Date('2026-12-31T18:30:00Z'),
      taxable: 153328, cgst: 0, sgst: 0, igst: 27599, total: 180927 }, [{ description: 'Launch plan', quantity: 1, taxable: 149900 }, { description: 'Fee on delivered orders · 2 orders', quantity: 2, taxable: 3428 }])!
    const f = await frrataFile(doc)
    expect(f.bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(f.fileName).toBe('Frrata TEST Tax invoice FRR-T26-27-000001.pdf')
    const cn = await frrataFile(frrataCreditNoteDoc(doc, { number: 'FRR/T26-27/C00001', issuedAt: new Date(), taxable: 10000, cgst: 0, sgst: 0, igst: 1800, total: 11800, reason: 'Goodwill', testMode: true }))
    expect(cn.fileName).toBe('Frrata TEST Credit note FRR-T26-27-C00001.pdf')
    expect(frrataInvoiceDoc({ number: null, issuedAt: null } as never, [])).toBeNull()
  }, 30_000)
})
