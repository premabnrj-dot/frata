import { describe, expect, it } from 'vitest'
import type { Invoice, InvoiceLine } from '@/domains/orders/documents'
import { gstr1, type GstDoc } from '../gstr1'
import { gstr1Json } from '../gstr1-files'
import { gstHeads } from '../gst'
import { compareLiability, liabilityOf, liabilityOfJson, stepOf, type Liability } from '../gsp'

const D = new Date('2026-10-15T06:00:00Z')
function line(taxable: number, bps: number, supply: 'intra' | 'inter'): InvoiceLine {
  const gst = Math.round((taxable * bps) / 10_000), h = gstHeads(gst, supply)
  return { title: 'Serum', hsn: '3304', qty: 1, uqc: 'NOS', gross: taxable, discount: 0, taxable, rateBps: bps, ...h, total: taxable + gst }
}
function inv(number: string, lines: InvoiceLine[], o: { gstin?: string; pos: string; supply: 'intra' | 'inter'; against?: string }): Invoice {
  const sum = (k: 'gross' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total') => lines.reduce((a, l) => a + l[k], 0)
  return { kind: o.against ? 'credit_note' : 'tax_invoice', number, date: D, cancelled: false,
    ...(o.against ? { against: { number: o.against, date: D, reason: 'returned' as const } } : {}),
    seller: { name: 'Kesar', address: 'Jaipur', gstin: '08ABCDE1234F1Z5' }, composition: false,
    buyer: { name: 'A', lines: [], gstin: o.gstin ?? null, business: o.gstin ? 'Studio' : null }, needsEwayBill: false,
    placeOfSupply: { state: 'X', code: o.pos }, supply: o.supply, lines,
    totals: { gross: sum('gross'), discount: 0, taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), total: sum('total') },
    pricesIncludeGst: true, charges: { delivery: 0, cod: 0 } }
}
/** A seeded random period: B2C small and large, B2B, intra and inter, notes against some. */
function period(seed: number, n: number) {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const invoices: Invoice[] = [], notes: GstDoc[] = []
  for (let i = 0; i < n; i++) {
    const pos = String(1 + Math.floor(rnd() * 36)).padStart(2, '0'), supply = pos === '08' ? 'intra' as const : 'inter' as const
    const b2b = rnd() < 0.2 ? '29ABCFS4421K1Z7' : undefined
    const big = rnd() < 0.05
    const ls = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => line(big ? 10_000_000 + Math.floor(rnd() * 5e6) : 5_000 + Math.floor(rnd() * 500_000), [0, 300, 500, 1800][Math.floor(rnd() * 4)]!, supply))
    const doc = inv(`KS/26-27/${String(i + 1).padStart(5, '0')}`, ls, { gstin: b2b, pos, supply })
    invoices.push(doc)
    if (rnd() < 0.15) notes.push({ doc: inv(`KS/26-27/C${String(i + 1).padStart(4, '0')}`, [ls[0]!], { gstin: b2b, pos, supply, against: doc.number }), of: doc })
  }
  return gstr1(invoices, notes)
}

describe('filing from Frrata: the liability the return declares', () => {
  it('reads back from the pushed JSON exactly, for any mix (what the portal will hold)', () => {
    for (const seed of [1, 7, 42, 2026, 99991]) {
      const g = period(seed, 600)
      const json = JSON.parse(JSON.stringify(gstr1Json(g, '08ABCDE1234F1Z5', '102026', () => 'Beauty')))
      expect(liabilityOfJson(json)).toEqual(liabilityOf(g))
    }
  })
  it('is the invoices less the GST credit notes', () => {
    const g = period(5, 300)
    const l = liabilityOf(g)
    expect(l.taxable).toBeLessThanOrEqual(g.totals.taxable)
    expect(l.taxable).toBeGreaterThan(0)
  })
  it('compares with the portal: a rupee of rounding per head, documents exact', () => {
    const a: Liability = { taxable: 100_000, igst: 5_000, cgst: 0, sgst: 0, documents: 3 }
    expect(compareLiability(a, { ...a, taxable: 100_100 })).toEqual([])
    expect(compareLiability(a, { ...a, taxable: 100_101 }).map((d) => d.head)).toEqual(['taxable'])
    expect(compareLiability(a, { ...a, documents: 4 }).map((d) => d.head)).toEqual(['documents'])
  })
  it('walks connect → push → check → file → filed, and back to push when the period changes', () => {
    const a: Liability = { taxable: 100_000, igst: 5_000, cgst: 0, sgst: 0, documents: 3 }
    expect(stepOf({ connected: false, filed: false, pushed: null, now: a, portal: null })).toBe('connect')
    expect(stepOf({ connected: true, filed: false, pushed: null, now: a, portal: null })).toBe('push')
    expect(stepOf({ connected: true, filed: false, pushed: a, now: a, portal: null })).toBe('check')
    expect(stepOf({ connected: true, filed: false, pushed: a, now: a, portal: { ...a, igst: 9_000 } })).toBe('check')
    expect(stepOf({ connected: true, filed: false, pushed: a, now: a, portal: a })).toBe('file')
    expect(stepOf({ connected: true, filed: false, pushed: a, now: { ...a, taxable: 99_999 }, portal: a })).toBe('push')
    expect(stepOf({ connected: false, filed: true, pushed: a, now: a, portal: a })).toBe('filed')
  })
})
