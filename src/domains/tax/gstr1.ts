// =============================================================================
// FILE: src/domains/tax/gstr1.ts — A PERIOD'S GSTR-1, FROM THE DOCUMENTS AS ISSUED (GST app G1; plan
// docs/plans/2026-11-09-gst-core-and-categories.md § 3, spec docs/specs/2026-11-09-gst-module.md). Pure; paise.
//
// The input is the invoices and credit notes exactly as the shop printed them (documents.ts invoice() / creditNote():
// the same per-line CGST/SGST/IGST heads, never a total split again; architecture review 2026-11-09, finding 8). Out
// come GSTR-1's tables in the merchant's words and the portal's names:
//   B2B (Table 4: buyer GSTIN), B2CL (Table 5: inter-state to unregistered, invoice over ₹1 lakh), B2CS (Table 7: the
//   rest, by place of supply and rate, net of their credit notes), CDNR / CDNUR (Table 9B: credit notes to registered
//   buyers, and to unregistered against a B2CL invoice), NIL (Table 8: 0% lines), HSN (Table 12, B2B and B2C apart),
//   DOCS (Table 13: the series issued). Goodwill credits are not GST documents and never appear.
// Thresholds and table rules: GSTN advisories (B2CL ₹1 lakh from Aug 2024 [S]); a CA checks the first period's output.
// =============================================================================

import type { Invoice } from '@/domains/orders/documents'

export const B2CL_ABOVE = 10_000_000 // ₹1,00,000 in paise: an inter-state B2C invoice above it is B2CL

export type Heads = { taxable: number; igst: number; cgst: number; sgst: number }
const zero = (): Heads => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 })
const add = (a: Heads, b: Heads, sign = 1): Heads => ({ taxable: a.taxable + sign * b.taxable, igst: a.igst + sign * b.igst, cgst: a.cgst + sign * b.cgst, sgst: a.sgst + sign * b.sgst })
const headsOf = (l: { taxable: number; igst: number; cgst: number; sgst: number }): Heads => ({ taxable: l.taxable, igst: l.igst, cgst: l.cgst, sgst: l.sgst })

/** One document as GSTR-1 reads it: the printed invoice or credit note, with the buyer's GSTIN (B2B) when it had one. */
export type GstDoc = { doc: Invoice
  /** For a credit note: the invoice it credits, as printed (its value decides B2CL vs B2CS). */
  of?: Invoice }

export type RateRow = Heads & { rate: number }
export type B2bInvoice = { gstin: string; name: string; number: string; date: Date; value: number; pos: string; rates: RateRow[] }
export type B2clInvoice = { number: string; date: Date; value: number; pos: string; rates: RateRow[] }
export type B2csRow = Heads & { pos: string; rate: number; supply: 'intra' | 'inter' }
export type NoteRow = { number: string; date: Date; value: number; pos: string; against: string; againstDate: Date; gstin: string | null; rates: RateRow[] }
export type HsnRow = Heads & { hsn: string; uqc: string; rate: number; qty: number }
export type DocSeries = { kind: 'invoices' | 'credit_notes'; from: string; to: string; total: number; cancelled: number }
export type NilRow = { supply: 'intra' | 'inter'; to: 'b2b' | 'b2c'; value: number }

export type Gstr1 = {
  b2b: B2bInvoice[]; b2cl: B2clInvoice[]; b2cs: B2csRow[]; cdnr: NoteRow[]; cdnur: NoteRow[]; nil: NilRow[]
  hsn: { b2b: HsnRow[]; b2c: HsnRow[] }
  docs: DocSeries[]
  totals: Heads & { invoices: number; creditNotes: number; credited: number }
}

/** Per rate, the lines' heads (0% lines go to NIL instead). */
function byRate(inv: Invoice): RateRow[] {
  const m = new Map<number, RateRow>()
  for (const l of inv.lines) {
    if (!l.rateBps) continue
    const r = m.get(l.rateBps) ?? { rate: l.rateBps, ...zero() }
    m.set(l.rateBps, { rate: r.rate, ...add(r, headsOf(l)) })
  }
  return [...m.values()].sort((a, b) => a.rate - b.rate)
}
const isB2cl = (inv: Invoice) => !inv.buyer.gstin && inv.supply === 'inter' && inv.totals.total > B2CL_ABOVE
const posOf = (inv: Invoice) => inv.placeOfSupply.code ?? '97' // 97: other territory (never for a delivery in India)

/** HSN rows from lines, `sign` -1 for a credit note (Table 12 is net of notes). */
function hsnInto(m: Map<string, HsnRow>, inv: Invoice, sign: number) {
  for (const l of inv.lines) {
    const key = `${l.hsn ?? ''}|${l.uqc}|${l.rateBps}`
    const r = m.get(key) ?? { hsn: l.hsn ?? '', uqc: l.uqc, rate: l.rateBps, qty: 0, ...zero() }
    m.set(key, { ...r, ...add(r, headsOf(l), sign), qty: r.qty + sign * l.qty })
  }
}

/** The series in a list of numbers: from, to, how many. Numbers sort by their own text (one FY series, zero-padded). */
function series(kind: DocSeries['kind'], numbers: string[], cancelled: number): DocSeries | null {
  if (!numbers.length) return null
  const s = [...numbers].sort()
  return { kind, from: s[0]!, to: s[s.length - 1]!, total: s.length, cancelled }
}

/**
 * A period's GSTR-1 from its invoices (dated in the period) and credit notes (issued in the period). Bills of supply
 * (a seller not charging GST) and goodwill credits are left out: neither is a GST document.
 */
export function gstr1(invoices: Invoice[], notes: GstDoc[]): Gstr1 {
  const tax = invoices.filter((i) => i.kind === 'tax_invoice')
  const gstNotes = notes.filter((n) => !n.doc.goodwill && n.doc.lines.some((l) => l.rateBps > 0 || l.taxable > 0))
  const b2bMap = new Map<string, B2bInvoice[]>()
  const b2cl: B2clInvoice[] = []
  const b2cs = new Map<string, B2csRow>()
  const nil = new Map<string, NilRow>()
  const hsnB2b = new Map<string, HsnRow>(), hsnB2c = new Map<string, HsnRow>()
  let totals = zero()
  const b2csInto = (inv: Invoice, sign: number) => {
    for (const r of byRate(inv)) {
      const key = `${posOf(inv)}|${r.rate}|${inv.supply}`
      const cur = b2cs.get(key) ?? { pos: posOf(inv), rate: r.rate, supply: inv.supply, ...zero() }
      b2cs.set(key, { ...cur, ...add(cur, r, sign) })
    }
  }
  const nilInto = (inv: Invoice, sign: number) => {
    for (const l of inv.lines) {
      if (l.rateBps) continue
      const to = inv.buyer.gstin ? 'b2b' : 'b2c' as const
      const key = `${inv.supply}|${to}`
      const cur = nil.get(key) ?? { supply: inv.supply, to, value: 0 }
      nil.set(key, { ...cur, value: cur.value + sign * l.taxable })
    }
  }
  for (const inv of tax) {
    totals = add(totals, headsOf(inv.totals))
    nilInto(inv, 1)
    if (inv.buyer.gstin) {
      const list = b2bMap.get(inv.buyer.gstin) ?? []
      list.push({ gstin: inv.buyer.gstin, name: inv.buyer.business ?? inv.buyer.name, number: inv.number, date: inv.date, value: inv.totals.total, pos: posOf(inv), rates: byRate(inv) })
      b2bMap.set(inv.buyer.gstin, list)
      hsnInto(hsnB2b, inv, 1)
    } else {
      if (isB2cl(inv)) b2cl.push({ number: inv.number, date: inv.date, value: inv.totals.total, pos: posOf(inv), rates: byRate(inv) })
      else b2csInto(inv, 1)
      hsnInto(hsnB2c, inv, 1)
    }
  }
  const cdnr: NoteRow[] = [], cdnur: NoteRow[] = []
  let credited = 0
  for (const n of gstNotes) {
    const doc = n.doc, of = n.of ?? n.doc
    credited += doc.totals.total
    totals = add(totals, headsOf(doc.totals), -1)
    nilInto(doc, -1)
    const row: NoteRow = { number: doc.number, date: doc.date, value: doc.totals.total, pos: posOf(doc), against: doc.against?.number ?? '', againstDate: doc.against?.date ?? doc.date, gstin: doc.buyer.gstin, rates: byRate(doc) }
    if (doc.buyer.gstin) { cdnr.push(row); hsnInto(hsnB2b, doc, -1) }
    else if (isB2cl(of)) { cdnur.push(row); hsnInto(hsnB2c, doc, -1) }
    // A B2C credit note against a small invoice nets into Table 7 (not 9B), by its place of supply and rate.
    else { b2csInto(doc, -1); hsnInto(hsnB2c, doc, -1) }
  }
  const docs = [
    series('invoices', invoices.filter((i) => i.kind === 'tax_invoice').map((i) => i.number), 0),
    series('credit_notes', gstNotes.map((n) => n.doc.number), 0),
  ].filter((x): x is DocSeries => x !== null)
  const sortHsn = (m: Map<string, HsnRow>) => [...m.values()].filter((r) => r.taxable || r.qty).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate)
  return {
    b2b: [...b2bMap.values()].flat().sort((a, b) => a.gstin.localeCompare(b.gstin) || a.number.localeCompare(b.number)),
    b2cl: b2cl.sort((a, b) => a.number.localeCompare(b.number)),
    b2cs: [...b2cs.values()].filter((r) => r.taxable || r.igst || r.cgst || r.sgst).sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate),
    cdnr, cdnur,
    nil: [...nil.values()].filter((r) => r.value),
    hsn: { b2b: sortHsn(hsnB2b), b2c: sortHsn(hsnB2c) },
    docs,
    totals: { ...totals, invoices: tax.length, creditNotes: gstNotes.length, credited },
  }
}

/** Gaps in one FY's invoice numbers (the series must run without a break; a gap needs an explanation for the CA). */
export function seriesGaps(numbers: string[]): string[] {
  const parsed = numbers.map((n) => { const m = /^(.*?)(\d+)$/.exec(n); return m ? { head: m[1]!, n: Number(m[2]!), width: m[2]!.length } : null }).filter((x): x is { head: string; n: number; width: number } => x !== null)
  const byHead = new Map<string, { ns: number[]; width: number }>()
  for (const p of parsed) { const h = byHead.get(p.head) ?? { ns: [], width: p.width }; h.ns.push(p.n); byHead.set(p.head, h) }
  const out: string[] = []
  for (const [head, { ns, width }] of byHead) {
    const s = [...new Set(ns)].sort((a, b) => a - b)
    for (let i = 1; i < s.length && out.length < 50; i++) for (let k = s[i - 1]! + 1; k < s[i]! && out.length < 50; k++) out.push(`${head}${String(k).padStart(width, '0')}`)
  }
  return out
}

/** The GSTR-1 period of a date: "2026-10" for a monthly filer; the quarter's first month for a quarterly one is the caller's. */
export type Period = { from: Date; to: Date; label: string; key: string; fp: string }
const IST = 5.5 * 3_600_000
/** A month (key YYYY-MM) or a quarter (key YYYY-Qn, Apr–Jun = Q1 of that FY's calendar months) as IST bounds. */
export function periodOf(key: string): Period | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key), q = /^(\d{4})-Q([1-4])$/.exec(key)
  const month = (y: number, mo: number) => new Date(Date.UTC(y, mo, 1) - IST)
  const name = (d: Date) => new Date(d.getTime() + IST).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]) - 1
    if (mo < 0 || mo > 11) return null
    return { from: month(y, mo), to: month(y, mo + 1), label: name(month(y, mo)), key, fp: `${m[2]}${m[1]}` }
  }
  if (q) {
    // GST quarters follow the financial year: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec (of the year), Q4 Jan–Mar (of year+1).
    const y = Number(q[1]), n = Number(q[2])
    const startMonth = n === 4 ? 0 : 3 * n, startYear = n === 4 ? y + 1 : y
    const from = month(startYear, startMonth), to = month(startYear, startMonth + 3)
    const end = new Date(to.getTime() - 1)
    return { from, to, label: `${name(from).split(' ')[0]}–${name(end)}`, key, fp: `${String(startMonth + 3).padStart(2, '0')}${startYear}` }
  }
  return null
}
/** The period a moment falls in, for a monthly or quarterly filer. */
export function periodKeyAt(at: Date, filing: 'monthly' | 'quarterly'): string {
  const ist = new Date(at.getTime() + IST)
  const y = ist.getUTCFullYear(), mo = ist.getUTCMonth()
  if (filing === 'monthly') return `${y}-${String(mo + 1).padStart(2, '0')}`
  const n = mo < 3 ? 4 : Math.floor(mo / 3)
  return `${n === 4 ? y - 1 : y}-Q${n}`
}
/** GSTR-1's due date: the 11th of the next month (monthly), the 13th after the quarter (quarterly). */
export function dueDate(p: Period, filing: 'monthly' | 'quarterly'): Date {
  const next = new Date(p.to.getTime() + IST)
  return new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), filing === 'monthly' ? 11 : 13) - IST)
}
