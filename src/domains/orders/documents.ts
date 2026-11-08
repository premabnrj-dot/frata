// =============================================================================
// FILE: src/domains/orders/documents.ts
//
// THE PACKING SLIP AND THE TAX INVOICE / BILL OF SUPPLY (1D·5), as data the
// print pages lay out. Pure. Everything is read from what the order stored at
// placement — prices, rates, each line's share of the charges, the seller's
// GSTIN — never from today's settings or a re-run of checkout's tax.
//
// Invoice particulars (CGST Rules 46 and 49; no current primary source found
// — the owner's CA confirms the template before first use): number ≤ 16
// characters unique in the financial year, date, seller name, address and
// GSTIN, buyer name and address, place of supply (state and code), per line
// HSN, quantity, taxable value, rate, CGST + SGST (same state) or IGST (other
// state), totals. Delivery and the Pay on delivery fee are part of one
// composite supply: each line's taxable value includes its share of them.
// =============================================================================

import { stateCode } from '@/domains/checkout/states'
import { gstHeads, split, supplyKind } from '@/domains/tax/gst'
import { collect, sharesOf, type StoredLine, type StoredOrder } from './amounts'

export type DocLine = StoredLine & { unitPrice: number; lineDiscount: number; title: string; optionValues: string[]; qty: number; sku: string | null; hsn: string | null; imageBase: string | null; imageWidths: number[] | null }
export type DocOrder = StoredOrder & {
  number: string; placedAt: Date; packedAt: Date | null; invoiceNumber: string | null; sellerGstin: string | null
  /** The seller as it was at packing; null before packing (the invoice then is not issued). */
  sellerName: string | null; sellerAddress: string | null
  customerName: string; phone: string; addressLine: string; area: string; landmark: string; city: string; pincode: string; state: string; supplyState: string | null
}
export type DocShop = { name: string; legalName: string; address: string; returnAddress: string }

/** The delivery address as printed: pre-1D orders have the area joined into the line already. */
export const addressLines = (o: Pick<DocOrder, 'addressLine' | 'area' | 'landmark' | 'city' | 'pincode' | 'state'>) =>
  [o.area ? `${o.addressLine}, ${o.area}` : o.addressLine, o.landmark, `${o.city} ${o.pincode}`.trim(), o.state].filter(Boolean)

export type PackingSlip = {
  shop: string; number: string; lines: { title: string; options: string; qty: number; sku: string | null; imageBase: string | null; imageWidths: number[] | null }[]
  to: { name: string; lines: string[]; phone: string }; returnTo: string
  /** Paise to collect at the door; 0 = "Prepaid — collect nothing". No prices on a slip. */
  collect: number
}

/** The most a print page prints at once (a bulk print of a queue page). */
export const MAX_DOCUMENTS = 50

export function packingSlip(o: DocOrder, lines: DocLine[], shop: DocShop): PackingSlip {
  return {
    shop: shop.name, number: o.number,
    lines: lines.map((l) => ({ title: l.title, options: l.optionValues.join(' · '), qty: l.qty, sku: l.sku, imageBase: l.imageBase, imageWidths: l.imageWidths })),
    to: { name: o.customerName, lines: addressLines(o), phone: o.phone }, returnTo: shop.returnAddress || shop.address,
    collect: collect(o),
  }
}

/**
 * `gross` and `discount` are before GST at the line's rate (an offer's discount, recorded on the invoice: CGST s.15(3)(a)),
 * so gross − discount = taxable (Rule 46); the charges' share sits in gross and taxable alike.
 */
export type InvoiceLine = { title: string; hsn: string | null; qty: number; gross: number; discount: number; taxable: number; rateBps: number; cgst: number; sgst: number; igst: number; total: number }
export type Invoice = {
  kind: 'tax_invoice' | 'bill_of_supply' | 'credit_note'; number: string; date: Date; cancelled: boolean
  /** A credit note's original invoice (CGST Rule 53: its number and date), and why the sale was undone. */
  against?: { number: string; date: Date; reason: CreditReason }
  seller: { name: string; address: string; gstin: string | null }
  buyer: { name: string; lines: string[] }
  placeOfSupply: { state: string; code: string | null }
  supply: 'intra' | 'inter'
  lines: InvoiceLine[]
  totals: { gross: number; discount: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }
  /** True when the prices the shopper saw included GST (the line says so). */
  pricesIncludeGst: boolean
  /** What the charges were, for the line under the table (they are inside each line's value). */
  charges: { delivery: number; cod: number }
}

/** Null until packed: the invoice number is issued at packing (owner call 3), so there is nothing to print before. */
export function invoice(o: DocOrder, lines: DocLine[], shop: DocShop): Invoice | null {
  if (!o.invoiceNumber || !o.packedAt) return null
  const kind = o.sellerGstin ? 'tax_invoice' : 'bill_of_supply'
  const code = stateCode(o.supplyState ?? o.state)
  const supply = supplyKind(o.sellerGstin, code)
  const shares = sharesOf(lines, o)
  const out = lines.map((l, i): InvoiceLine => {
    const taxable = l.taxableValue + shares[i]!.chargeTaxable
    const gst = l.gst + shares[i]!.chargeGst
    const heads = kind === 'tax_invoice' ? gstHeads(gst, supply) : { cgst: 0, sgst: 0, igst: 0 }
    // The discount before GST: the line's gross value before GST at its rate, less its stored taxable value.
    const discount = l.lineDiscount ? split(l.unitPrice * l.qty, l.gstBps, o.pricesIncludeGst).taxable - l.taxableValue : 0
    return { title: [l.title, ...l.optionValues].join(' · '), hsn: l.hsn, qty: l.qty, gross: taxable + discount, discount, taxable, rateBps: kind === 'tax_invoice' ? l.gstBps : 0, ...heads, total: taxable + heads.cgst + heads.sgst + heads.igst }
  })
  const sum = (k: keyof Pick<InvoiceLine, 'gross' | 'discount' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'>) => out.reduce((a, l) => a + l[k], 0)
  return {
    kind, number: o.invoiceNumber, date: o.packedAt, cancelled: !!o.cancelledAt,
    seller: { name: o.sellerName ?? (shop.legalName || shop.name), address: o.sellerAddress ?? shop.address, gstin: o.sellerGstin },
    buyer: { name: o.customerName, lines: addressLines(o) },
    placeOfSupply: { state: o.supplyState ?? o.state, code }, supply,
    lines: out, totals: { gross: sum('gross'), discount: sum('discount'), taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), total: sum('total') },
    pricesIncludeGst: o.pricesIncludeGst, charges: { delivery: o.shipping, cod: o.codCharge },
  }
}

/** Why a packed sale was undone (Documents D3): cancelled after packing, or the parcel came back. */
export const CREDIT_REASONS = ['cancelled', 'came_back'] as const
export type CreditReason = (typeof CREDIT_REASONS)[number]
export type IssuedCredit = { number: string; issuedAt: Date; reason: CreditReason; against: string; total: number }

/**
 * A credit note (Documents D3): the issued invoice reversed in full — the same lines, taxable values and tax heads,
 * from the same frozen rows, under the credit note's own number and date, citing the invoice it reverses (CGST Rule
 * 53). Null without an issued invoice. Never recomputed from today's prices: `invoice()` reads the order as packed.
 */
export function creditNote(o: DocOrder, lines: DocLine[], shop: DocShop, cn: IssuedCredit): Invoice | null {
  const inv = invoice(o, lines, shop)
  if (!inv) return null
  // The figures it was issued with are stored (credit_notes): a rendering that disagrees is a broken document, never
  // printed (impact review 2026-11-08: two copies need one comparison).
  if (inv.number !== cn.against || inv.totals.total !== cn.total) throw new Error('credit note differs from what was issued')
  return { ...inv, kind: 'credit_note', number: cn.number, date: cn.issuedAt, cancelled: false, against: { number: inv.number, date: inv.date, reason: cn.reason } }
}
