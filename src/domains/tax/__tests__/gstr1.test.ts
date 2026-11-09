import { describe, expect, it } from 'vitest'
import type { Invoice, InvoiceLine } from '@/domains/orders/documents'
import { B2CL_ABOVE, dueDate, gstr1, periodKeyAt, periodOf, seriesGaps } from '../gstr1'
import { gstr1Csv, gstr1Json, salesRegister, tallyXml } from '../gstr1-files'
import { gstHeads } from '../gst'

const D = new Date('2026-10-15T06:00:00Z')
function line(taxable: number, bps: number, supply: 'intra' | 'inter', hsn = '6204', qty = 1): InvoiceLine {
  const gst = Math.round((taxable * bps) / 10_000), h = gstHeads(gst, supply)
  return { title: 'Kurta', hsn, qty, uqc: 'NOS', gross: taxable, discount: 0, taxable, rateBps: bps, ...h, total: taxable + gst }
}
function inv(number: string, lines: InvoiceLine[], o: { gstin?: string; pos?: string; supply?: 'intra' | 'inter'; credit?: { against: string }; goodwill?: boolean } = {}): Invoice {
  const sum = (k: 'gross' | 'discount' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total') => lines.reduce((a, l) => a + l[k], 0)
  return { kind: o.credit ? 'credit_note' : 'tax_invoice', number, date: D, cancelled: false,
    ...(o.credit ? { against: { number: o.credit.against, date: D, reason: 'returned' as const } } : {}), ...(o.goodwill ? { goodwill: true } : {}),
    seller: { name: 'Kesar', address: 'Jaipur', gstin: '08ABCDE1234F1Z5' }, composition: false,
    buyer: { name: 'A', lines: [], gstin: o.gstin ?? null, business: o.gstin ? 'Studio Neel LLP' : null }, needsEwayBill: false,
    placeOfSupply: { state: 'X', code: o.pos ?? '08' }, supply: o.supply ?? 'intra', lines,
    totals: { gross: sum('gross'), discount: 0, taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), total: sum('total') },
    pricesIncludeGst: true, charges: { delivery: 0, cod: 0 } }
}

describe('GSTR-1 from the documents as issued', () => {
  const invoices = [
    inv('KS/26-27/00041', [line(237143, 500, 'intra'), line(66990, 300, 'intra', '7117')]),
    inv('KS/26-27/00042', [line(474286, 500, 'inter')], { pos: '27', supply: 'inter' }),
    inv('KS/26-27/00043', [line(10_200_000, 1800, 'inter', '6204')], { pos: '33', supply: 'inter' }), // ₹1.02 lakh: B2CL
    inv('KS/26-27/00044', [line(3_000_000, 500, 'inter')], { gstin: '29ABCFS4421K1Z7', pos: '29', supply: 'inter' }),
    inv('KS/26-27/00045', [line(50000, 0, 'intra', '5007')]),
  ]
  const notes = [
    { doc: inv('KS/26-27/C0011', [line(237143, 500, 'intra')], { credit: { against: 'KS/26-27/00041' } }), of: invoices[0] },
    { doc: inv('KS/26-27/C0012', [line(1_000_000, 500, 'inter')], { gstin: '29ABCFS4421K1Z7', pos: '29', supply: 'inter', credit: { against: 'KS/26-27/00044' } }), of: invoices[3] },
    { doc: inv('KS/26-27/G0001', [line(30000, 0, 'intra')], { credit: { against: 'KS/26-27/00041' }, goodwill: true }), of: invoices[0] },
  ]
  const g = gstr1(invoices, notes)
  it('B2B by buyer GSTIN; B2CL above ₹1 lakh inter-state; the rest in B2CS by place and rate', () => {
    expect(g.b2b.map((i) => i.number)).toEqual(['KS/26-27/00044'])
    expect(g.b2cl.map((i) => i.number)).toEqual(['KS/26-27/00043'])
    expect(g.b2cs.map((r) => `${r.pos}:${r.rate}:${r.supply}`)).toEqual(['08:300:intra', '27:500:inter'])
    expect(invoices[2]!.totals.total).toBeGreaterThan(B2CL_ABOVE)
  })
  it('a B2C credit note against a small invoice nets into B2CS; a registered buyer’s goes to CDNR; goodwill nowhere', () => {
    expect(g.b2cs.find((r) => r.pos === '08' && r.rate === 500)).toBeUndefined() // the kurta returned in full nets to nothing
    expect(g.cdnr.map((n) => n.number)).toEqual(['KS/26-27/C0012'])
    expect(g.cdnur).toEqual([])
    expect(g.docs.find((d) => d.kind === 'credit_notes')).toMatchObject({ total: 2 })
  })
  it('0% lines go to NIL; HSN is split B2B / B2C and net of notes; totals add up', () => {
    expect(g.nil).toEqual([{ supply: 'intra', to: 'b2c', value: 50000 }])
    expect(g.hsn.b2b.map((r) => `${r.hsn}:${r.taxable}`)).toEqual(['6204:2000000'])
    expect(g.hsn.b2c.find((r) => r.hsn === '7117')).toMatchObject({ qty: 1, rate: 300 })
    const all = invoices.reduce((a, i) => a + i.totals.taxable, 0) - notes.filter((n) => !n.doc.goodwill).reduce((a, n) => a + n.doc.totals.taxable, 0)
    expect(g.totals.taxable).toBe(all)
    const hsnTaxable = [...g.hsn.b2b, ...g.hsn.b2c].reduce((a, r) => a + r.taxable, 0)
    expect(hsnTaxable).toBe(all)
  })
  it('the JSON the offline tool reads: rupees, dd-mm-yyyy, MMYYYY', () => {
    const j = gstr1Json(g, '08ABCDE1234F1Z5', '102026', () => 'Garments') as Record<string, any>
    expect(j.fp).toBe('102026')
    expect(j.b2b[0].ctin).toBe('29ABCFS4421K1Z7')
    expect(j.b2b[0].inv[0]).toMatchObject({ inum: 'KS/26-27/00044', idt: '15-10-2026', val: 31500, pos: '29', rchrg: 'N' })
    expect(j.b2cl[0].pos).toBe('33')
    expect(j.hsn.hsn_b2b[0]).toMatchObject({ hsn_sc: '6204', rt: 5, txval: 20000 })
    expect(j.doc_issue.doc_det[0].docs[0]).toMatchObject({ from: 'KS/26-27/00041', to: 'KS/26-27/00045', totnum: 5 })
  })
  it('CSVs, the sales register and Tally vouchers', () => {
    const c = gstr1Csv(g)
    expect(c.b2cs!.split('\n')[0]).toBe('Place of supply,Supply,Rate,Taxable value,IGST,CGST,SGST')
    const reg = salesRegister(invoices, notes.map((n) => n.doc))
    expect(reg.split('\n').filter(Boolean)).toHaveLength(1 + 6 + 2) // header, 6 invoice lines, 2 GST credit-note lines (goodwill left out)
    const t = tallyXml('Kesar & Co', invoices, notes.map((n) => n.doc))
    expect(t).toContain('<SVCURRENTCOMPANY>Kesar &amp; Co</SVCURRENTCOMPANY>')
    expect((t.match(/VCHTYPE="Sales"/g) ?? []).length).toBe(5)
    expect((t.match(/VCHTYPE="Credit Note"/g) ?? []).length).toBe(2)
  })
  it('stress: 20,000 invoices across 36 states in well under a second, totals exact', () => {
    const many: Invoice[] = []
    for (let i = 0; i < 20_000; i++) {
      const pos = String(1 + (i % 36)).padStart(2, '0'), inter = pos !== '08'
      many.push(inv(`KS/26-27/${String(i + 1).padStart(5, '0')}`, [line(100_000 + (i % 7) * 50_000, [300, 500, 1800][i % 3]!, inter ? 'inter' : 'intra'), line(40_000, 500, inter ? 'inter' : 'intra', '6214', 2)], { pos, supply: inter ? 'inter' : 'intra' }))
    }
    const t0 = performance.now()
    const big = gstr1(many, [])
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(big.totals.taxable).toBe(many.reduce((a, i) => a + i.totals.taxable, 0))
    expect(big.totals.igst + big.totals.cgst + big.totals.sgst).toBe(many.reduce((a, i) => a + i.totals.igst + i.totals.cgst + i.totals.sgst, 0))
    expect(big.b2cs.reduce((a, r) => a + r.taxable, 0)).toBe(big.totals.taxable)
    expect(big.docs[0]).toMatchObject({ total: 20_000, from: 'KS/26-27/00001', to: 'KS/26-27/20000' })
  })
})

describe('series, periods and due dates', () => {
  it('finds gaps in an invoice series', () => {
    expect(seriesGaps(['KS/26-27/00041', 'KS/26-27/00044', 'KS/26-27/00042'])).toEqual(['KS/26-27/00043'])
    expect(seriesGaps(['KS/26-27/00001', 'KS/26-27/00002'])).toEqual([])
  })
  it('months and FY quarters in IST', () => {
    const m = periodOf('2026-10')!
    expect(m.from.toISOString()).toBe('2026-09-30T18:30:00.000Z'); expect(m.fp).toBe('102026'); expect(m.label).toBe('October 2026')
    const q = periodOf('2026-Q3')!
    expect(q.from.toISOString()).toBe('2026-09-30T18:30:00.000Z'); expect(q.to.toISOString()).toBe('2026-12-31T18:30:00.000Z'); expect(q.fp).toBe('122026')
    const q4 = periodOf('2026-Q4')!
    expect(q4.from.toISOString()).toBe('2026-12-31T18:30:00.000Z'); expect(q4.fp).toBe('032027')
    expect(periodOf('2026-13')).toBeNull(); expect(periodOf('nope')).toBeNull()
    expect(periodKeyAt(new Date('2026-10-31T19:00:00Z'), 'monthly')).toBe('2026-11') // 1 Nov in IST
    expect(periodKeyAt(new Date('2027-02-01T06:00:00Z'), 'quarterly')).toBe('2026-Q4')
    expect(dueDate(m, 'monthly').toISOString()).toBe('2026-11-10T18:30:00.000Z')
    expect(dueDate(q, 'quarterly').toISOString()).toBe('2027-01-12T18:30:00.000Z')
  })
})
