// =============================================================================
// FILE: src/domains/tax/gstr1-files.ts — THE FILES A CA IMPORTS (GST app G1, spec docs/specs/2026-11-09-gst-module.md
// § Design 9). Pure: strings from a period's GSTR-1 (gstr1.ts) and its documents. Rupees with two decimals, dates
// dd-mm-yyyy (the GST portal's), CSV quoted where needed, XML escaped.
//   - GSTR-1 JSON in the shape the GST offline tool imports (b2b, b2cl, b2cs, cdnr, cdnur, nil, hsn, doc_issue). The CA
//     opens it in the offline tool first: GSTN changes the schema by advisory (checked against no current schema file).
//   - CSV per table and a sales register (one row per invoice line).
//   - Tally vouchers (XML for Import Data): a Sales voucher per invoice, a Credit Note voucher per credit note, ledger
//     names the CA maps once ("Sales", "Output CGST"…).
// =============================================================================

import type { Invoice } from '@/domains/orders/documents'
import type { Gstr1, Heads, NoteRow, RateRow } from './gstr1'

const r2 = (p: number) => Math.round(p) / 100
const dmy = (d: Date) => { const x = new Date(d.getTime() + 5.5 * 3_600_000); return `${String(x.getUTCDate()).padStart(2, '0')}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${x.getUTCFullYear()}` }
const ymd = (d: Date) => dmy(d).split('-').reverse().join('')
const rt = (bps: number) => bps / 100
const itms = (rates: RateRow[]) => rates.map((r, i) => ({ num: i + 1, itm_det: { rt: rt(r.rate), txval: r2(r.taxable), iamt: r2(r.igst), camt: r2(r.cgst), samt: r2(r.sgst), csamt: 0 } }))
const note = (n: NoteRow) => ({ ntty: 'C', nt_num: n.number, nt_dt: dmy(n.date), val: r2(n.value), pos: n.pos, rchrg: 'N', inv_typ: 'R', itms: itms(n.rates) })

/** GSTR-1 as the offline tool's JSON. `fp`: MMYYYY of the return period. */
export function gstr1Json(g: Gstr1, gstin: string, fp: string, hsnDesc: (hsn: string) => string) {
  const b2b = new Map<string, { ctin: string; inv: unknown[] }>()
  for (const i of g.b2b) {
    const e = b2b.get(i.gstin) ?? { ctin: i.gstin, inv: [] }
    e.inv.push({ inum: i.number, idt: dmy(i.date), val: r2(i.value), pos: i.pos, rchrg: 'N', inv_typ: 'R', itms: itms(i.rates) })
    b2b.set(i.gstin, e)
  }
  const b2clByPos = new Map<string, { pos: string; inv: unknown[] }>()
  for (const i of g.b2cl) { const e = b2clByPos.get(i.pos) ?? { pos: i.pos, inv: [] }; e.inv.push({ inum: i.number, idt: dmy(i.date), val: r2(i.value), itms: itms(i.rates) }); b2clByPos.set(i.pos, e) }
  const cdnr = new Map<string, { ctin: string; nt: unknown[] }>()
  for (const n of g.cdnr) { const e = cdnr.get(n.gstin!) ?? { ctin: n.gstin!, nt: [] }; e.nt.push(note(n)); cdnr.set(n.gstin!, e) }
  const hsn = (rows: Gstr1['hsn']['b2b']) => rows.map((r, i) => ({ num: i + 1, hsn_sc: r.hsn, desc: hsnDesc(r.hsn).slice(0, 30), uqc: r.uqc, qty: r.qty, rt: rt(r.rate), txval: r2(r.taxable), iamt: r2(r.igst), camt: r2(r.cgst), samt: r2(r.sgst), csamt: 0 }))
  return {
    gstin, fp, version: 'GST3.2.1', hash: 'hash',
    ...(g.b2b.length ? { b2b: [...b2b.values()] } : {}),
    ...(g.b2cl.length ? { b2cl: [...b2clByPos.values()] } : {}),
    ...(g.b2cs.length ? { b2cs: g.b2cs.map((r) => ({ sply_ty: r.supply === 'intra' ? 'INTRA' : 'INTER', rt: rt(r.rate), typ: 'OE', pos: r.pos, txval: r2(r.taxable), iamt: r2(r.igst), camt: r2(r.cgst), samt: r2(r.sgst), csamt: 0 })) } : {}),
    ...(g.cdnr.length ? { cdnr: [...cdnr.values()] } : {}),
    ...(g.cdnur.length ? { cdnur: g.cdnur.map((n) => ({ typ: 'B2CL', ...note(n) })) } : {}),
    ...(g.nil.length ? { nil: { inv: g.nil.map((n) => ({ sply_ty: `${n.supply === 'intra' ? 'INTRA' : 'INTER'}${n.to === 'b2b' ? 'B2B' : 'B2C'}`, nil_amt: r2(n.value), expt_amt: 0, ngsup_amt: 0 })) } } : {}),
    hsn: { hsn_b2b: hsn(g.hsn.b2b), hsn_b2c: hsn(g.hsn.b2c) },
    doc_issue: { doc_det: g.docs.map((d, i) => ({ doc_num: d.kind === 'invoices' ? 1 : 5, docs: [{ num: i + 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancelled, net_issue: d.total - d.cancelled }] })) },
  }
}

const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const csv = (head: string[], rows: (string | number)[][]) => [head, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'
const money = (h: Heads) => [r2(h.taxable), r2(h.igst), r2(h.cgst), r2(h.sgst)]

/** One CSV per GSTR-1 table, by its name. */
export function gstr1Csv(g: Gstr1): Record<string, string> {
  const H = ['Taxable value', 'IGST', 'CGST', 'SGST']
  return {
    b2b: csv(['Buyer GSTIN', 'Buyer', 'Invoice', 'Date', 'Invoice value', 'Place of supply', 'Rate', ...H], g.b2b.flatMap((i) => i.rates.map((r) => [i.gstin, i.name, i.number, dmy(i.date), r2(i.value), i.pos, rt(r.rate), ...money(r)]))),
    b2cl: csv(['Invoice', 'Date', 'Invoice value', 'Place of supply', 'Rate', ...H], g.b2cl.flatMap((i) => i.rates.map((r) => [i.number, dmy(i.date), r2(i.value), i.pos, rt(r.rate), ...money(r)]))),
    b2cs: csv(['Place of supply', 'Supply', 'Rate', ...H], g.b2cs.map((r) => [r.pos, r.supply === 'intra' ? 'Intra-state' : 'Inter-state', rt(r.rate), ...money(r)])),
    cdnr: csv(['Buyer GSTIN', 'Credit note', 'Date', 'Against', 'Invoice date', 'Value', 'Rate', ...H], g.cdnr.flatMap((n) => n.rates.map((r) => [n.gstin ?? '', n.number, dmy(n.date), n.against, dmy(n.againstDate), r2(n.value), rt(r.rate), ...money(r)]))),
    cdnur: csv(['Credit note', 'Date', 'Against', 'Invoice date', 'Value', 'Place of supply', 'Rate', ...H], g.cdnur.flatMap((n) => n.rates.map((r) => [n.number, dmy(n.date), n.against, dmy(n.againstDate), r2(n.value), n.pos, rt(r.rate), ...money(r)]))),
    hsn: csv(['Table', 'HSN', 'Unit', 'Quantity', 'Rate', ...H], [...g.hsn.b2b.map((r) => ['B2B', r.hsn, r.uqc, r.qty, rt(r.rate), ...money(r)]), ...g.hsn.b2c.map((r) => ['B2C', r.hsn, r.uqc, r.qty, rt(r.rate), ...money(r)])]),
    docs: csv(['Documents', 'From', 'To', 'Total', 'Cancelled'], g.docs.map((d) => [d.kind === 'invoices' ? 'Invoices' : 'Credit notes', d.from, d.to, d.total, d.cancelled])),
  }
}

/** The sales register: every invoice and credit-note line of the period (credit notes negative). */
export function salesRegister(invoices: Invoice[], notes: Invoice[]): string {
  const row = (d: Invoice, sign: number) => d.lines.map((l) => [d.kind === 'credit_note' ? 'Credit note' : d.kind === 'tax_invoice' ? 'Tax invoice' : 'Bill of supply', d.number, dmy(d.date), d.against?.number ?? '',
    d.buyer.gstin ?? '', d.buyer.business ?? d.buyer.name, d.placeOfSupply.state, d.placeOfSupply.code ?? '', l.title, l.hsn ?? '', l.qty * sign, l.uqc, rt(l.rateBps),
    r2(sign * l.taxable), r2(sign * l.igst), r2(sign * l.cgst), r2(sign * l.sgst), r2(sign * l.total)])
  return csv(['Document', 'Number', 'Date', 'Against', 'Buyer GSTIN', 'Buyer', 'Place of supply', 'State code', 'Item', 'HSN', 'Quantity', 'Unit', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Total'],
    [...invoices.flatMap((i) => row(i, 1)), ...notes.filter((n) => !n.goodwill).flatMap((n) => row(n, -1))])
}

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ledger = (name: string, amount: number, deemedPositive: boolean) =>
  `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${x(name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemedPositive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${(deemedPositive ? -1 : 1) * r2(amount)}</AMOUNT></ALLLEDGERENTRIES.LIST>`

/** Tally vouchers (Import Data XML): a Sales voucher per invoice, a Credit Note voucher per GST credit note. */
export function tallyXml(company: string, invoices: Invoice[], notes: Invoice[]): string {
  const voucher = (d: Invoice, type: 'Sales' | 'Credit Note') => {
    const t = d.totals, party = d.buyer.business ?? 'Cash Sales'
    const sale = type === 'Sales'
    const lines = [ledger(party, t.total, sale), ledger('Sales', t.taxable, !sale),
      ...(t.cgst ? [ledger('Output CGST', t.cgst, !sale)] : []), ...(t.sgst ? [ledger('Output SGST', t.sgst, !sale)] : []), ...(t.igst ? [ledger('Output IGST', t.igst, !sale)] : [])]
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${ymd(d.date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${x(d.number)}</VOUCHERNUMBER>` +
      `<PARTYLEDGERNAME>${x(party)}</PARTYLEDGERNAME>${d.buyer.gstin ? `<PARTYGSTIN>${d.buyer.gstin}</PARTYGSTIN>` : ''}<PLACEOFSUPPLY>${x(d.placeOfSupply.state)}</PLACEOFSUPPLY>` +
      `${d.against ? `<REFERENCE>${x(d.against.number)}</REFERENCE>` : ''}${lines.join('')}</VOUCHER></TALLYMESSAGE>`
  }
  const body = [...invoices.filter((i) => i.kind === 'tax_invoice').map((i) => voucher(i, 'Sales')), ...notes.filter((n) => !n.goodwill).map((n) => voucher(n, 'Credit Note'))].join('')
  return `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>` +
    `<STATICVARIABLES><SVCURRENTCOMPANY>${x(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`
}
