// =============================================================================
// FILE: src/domains/billing/document.ts — FRRATA'S INVOICE AND CREDIT NOTE AS DOCUMENT DATA (billing B2; plan finding
// 16). Pure: built from the frozen rows at download time (nothing is stored as a PDF), for the renderer in
// src/lib/documents/pdf/frrata-invoice.tsx. GST heads are the invoice's own (each on the taxable total, finding 20),
// never re-derived per line.
// =============================================================================

export type FrrataDocLine = { description: string; quantity: number; taxable: number }
export type FrrataDoc = {
  kind: 'invoice' | 'credit_note'
  number: string; date: Date; testMode: boolean
  seller: { name: string; gstin: string | null; address: string }
  buyer: { name: string; gstin: string | null; address: string; placeOfSupply: string | null }
  sac: string
  period: { start: Date; end: Date } | null
  lines: FrrataDocLine[]
  totals: { taxable: number; cgst: number; sgst: number; igst: number; total: number }
  /** A credit note's invoice (Rule 53) and why. */
  against: { number: string; date: Date; reason: string } | null
}

type InvoiceRow = { number: string | null; issuedAt: Date | null; testMode: boolean; sellerName: string | null; sellerGstin: string | null; sellerAddress: string | null; sac: string | null
  buyerName: string | null; buyerGstin: string | null; buyerAddress: string | null; placeOfSupply: string | null; periodStart: Date; periodEnd: Date
  taxable: number; cgst: number; sgst: number; igst: number; total: number }

/** Null for a draft or a closed month (no number): only an issued invoice is a document. */
export function frrataInvoiceDoc(i: InvoiceRow, lines: { description: string; quantity: number; taxable: number }[]): FrrataDoc | null {
  if (!i.number || !i.issuedAt) return null
  return {
    kind: 'invoice', number: i.number, date: i.issuedAt, testMode: i.testMode,
    seller: { name: i.sellerName ?? 'Frrata', gstin: i.sellerGstin, address: i.sellerAddress ?? '' },
    buyer: { name: i.buyerName ?? '', gstin: i.buyerGstin, address: i.buyerAddress ?? '', placeOfSupply: i.placeOfSupply },
    sac: i.sac ?? '', period: { start: i.periodStart, end: i.periodEnd },
    lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, taxable: l.taxable })),
    totals: { taxable: i.taxable, cgst: i.cgst, sgst: i.sgst, igst: i.igst, total: i.total }, against: null,
  }
}

export function frrataCreditNoteDoc(inv: FrrataDoc, cn: { number: string; issuedAt: Date; taxable: number; cgst: number; sgst: number; igst: number; total: number; reason: string; testMode: boolean }): FrrataDoc {
  return {
    ...inv, kind: 'credit_note', number: cn.number, date: cn.issuedAt, testMode: cn.testMode, period: null,
    lines: [{ description: cn.reason, quantity: 1, taxable: cn.taxable }],
    totals: { taxable: cn.taxable, cgst: cn.cgst, sgst: cn.sgst, igst: cn.igst, total: cn.total },
    against: { number: inv.number, date: inv.date, reason: cn.reason },
  }
}

/** One row of the GST export (GSTR-1 style) for a CA. */
export type GstRow = { type: 'Invoice' | 'Credit note'; number: string; date: Date; against: string; buyer: string; gstin: string; placeOfSupply: string; taxable: number; cgst: number; sgst: number; igst: number; total: number }

/** A CSV cell: quoted, quotes doubled, and a leading = + - @ (or tab/CR) neutralised so a spreadsheet never runs it (finding 17). */
export function csvCell(v: string | number): string {
  const s = String(v)
  // A plain number ("-118.00") stays a number; anything else starting with a formula character is made text.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

const rs = (p: number) => (p / 100).toFixed(2)
export function gstCsv(rows: GstRow[], day: (d: Date) => string): string {
  const head = ['Type', 'Number', 'Date', 'Against invoice', 'Buyer', 'Buyer GSTIN', 'Place of supply', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total']
  const sign = (r: GstRow, p: number) => (r.type === 'Credit note' ? -p : p)
  return [head.map(csvCell).join(','), ...rows.map((r) => [r.type, r.number, day(r.date), r.against, r.buyer, r.gstin, r.placeOfSupply,
    rs(sign(r, r.taxable)), rs(sign(r, r.cgst)), rs(sign(r, r.sgst)), rs(sign(r, r.igst)), rs(sign(r, r.total))].map(csvCell).join(','))].join('\r\n') + '\r\n'
}
