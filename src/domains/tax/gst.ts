// =============================================================================
// FILE: src/domains/tax/gst.ts
//
// GST ON WHAT A FASHION SHOP SELLS, per line, rounded per line so the invoice
// (1D) adds up to the order. Apparel (HSN chapters 61, 62) and footwear (64):
// 5% when the sale value of a piece is up to ₹2,500, 18% above — Notification
// 9/2025-Central Tax (Rate), w.e.f. 22 Sep 2025 (text read 2026-11-07; the
// owner's CA confirms before the first invoice). Other goods: 18% until a rate
// is set for them (conservative). A shop with no GSTIN charges none.
//
// Prices may include GST (the default) or not. The ₹2,500 test is on the
// taxable value per piece: an inclusive ₹2,600 is ₹2,476.19 at 5% → 5%. Between
// ₹2,625 and ₹2,950 inclusive no rate is self-consistent (at 5% the value is
// over ₹2,500, at 18% under); we test at 5%, which puts those at 18%.
//
// Delivery and the Pay on delivery fee are part of one composite supply: each
// line takes a share by taxable value and that share is taxed at the line's
// rate (no current primary source; CA to confirm). Pure; paise throughout.
// =============================================================================

export const SLAB_PAISE = 250_000
export const LOW_BPS = 500
export const HIGH_BPS = 1_800

const SLAB_CHAPTERS = ['61', '62', '64']

/** The rate for one piece, from its HSN and its price (as shown, with or without GST). */
export function rateFor(hsn: string | null, unitPrice: number, pricesIncludeGst: boolean): number {
  const chapter = (hsn ?? '').replace(/\D/g, '').slice(0, 2)
  if (!SLAB_CHAPTERS.includes(chapter)) return HIGH_BPS
  const taxable = pricesIncludeGst ? (unitPrice * 10_000) / (10_000 + LOW_BPS) : unitPrice
  return taxable <= SLAB_PAISE ? LOW_BPS : HIGH_BPS
}

/** An amount split into taxable value and GST at `bps`. */
export function split(amount: number, bps: number, inclusive: boolean): { taxable: number; gst: number } {
  if (!bps) return { taxable: amount, gst: 0 }
  if (inclusive) { const taxable = Math.round((amount * 10_000) / (10_000 + bps)); return { taxable, gst: amount - taxable } }
  return { taxable: amount, gst: Math.round((amount * bps) / 10_000) }
}

/** `total` shared over `weights` in proportion, in whole paise, the remainders to the largest fractions (sums exactly). */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!sum || !total) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) { if (left <= 0) break; out[i]! += 1; left -= 1 }
  return out
}

export type TaxLine = { gross: number; unitPrice: number; hsn: string | null }
export type TaxedLine = { bps: number; taxable: number; gst: number }
/** A line's share of the charges (delivery + COD fee), taxed at the line's own rate. */
export type ChargeShare = { chargeTaxable: number; chargeGst: number }

/** The charges shared over lines already taxed (by taxable value) and taxed at each line's rate. Sums exactly to `charges`. */
export function shareCharges(taxed: Pick<TaxedLine, 'bps' | 'taxable'>[], charges: number, pricesIncludeGst: boolean): ChargeShare[] {
  const shares = apportion(charges, taxed.map((t) => t.taxable))
  if (charges && !shares.some(Boolean) && taxed.length) shares[0] = charges // every line free: the first carries the charges
  return shares.map((share, i) => { const s = split(share, taxed[i]!.bps, pricesIncludeGst); return { chargeTaxable: s.taxable, chargeGst: s.gst } })
}

/** GST on each line and on the charges (delivery + COD fee) shared over the lines. `registered` false: no GST at all. */
export function taxOrder(lines: TaxLine[], charges: number, o: { registered: boolean; pricesIncludeGst: boolean }): { lines: (TaxedLine & ChargeShare)[]; chargesGst: number; chargesTaxable: number } {
  const taxed = o.registered
    ? lines.map((l) => { const bps = rateFor(l.hsn, l.unitPrice, o.pricesIncludeGst); return { bps, ...split(l.gross, bps, o.pricesIncludeGst) } })
    : lines.map((l) => ({ bps: 0, taxable: l.gross, gst: 0 }))
  const shares = shareCharges(taxed, charges, o.pricesIncludeGst)
  const out = taxed.map((t, i) => ({ ...t, ...shares[i]! }))
  return { lines: out, chargesGst: out.reduce((a, l) => a + l.chargeGst, 0), chargesTaxable: out.reduce((a, l) => a + l.chargeTaxable, 0) }
}

/** The state code a GSTIN belongs to (its first two digits), e.g. "08" Rajasthan. */
export const gstinState = (gstin: string | null) => (gstin && /^[0-9]{2}/.test(gstin) ? gstin.slice(0, 2) : null)

/**
 * CGST + SGST when the place of supply is the seller's own state, IGST otherwise (IGST Act s.10(1)(a): goods
 * moved to the buyer — the delivery state). Compared by STATE CODE: an order stores the delivery state by name.
 */
export function supplyKind(sellerGstin: string | null, supplyStateCode: string | null): 'intra' | 'inter' {
  const seller = gstinState(sellerGstin)
  return seller && supplyStateCode && seller === supplyStateCode ? 'intra' : 'inter'
}

/** GST shown on an invoice: half CGST and half SGST (the odd paisa to SGST), or all IGST. */
export const gstHeads = (gst: number, kind: 'intra' | 'inter') =>
  kind === 'intra' ? { cgst: Math.floor(gst / 2), sgst: gst - Math.floor(gst / 2), igst: 0 } : { cgst: 0, sgst: 0, igst: gst }
