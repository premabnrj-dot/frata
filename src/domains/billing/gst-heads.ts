// =============================================================================
// FILE: src/domains/billing/gst-heads.ts — GST on Frrata's own invoices, head by head (plan finding 20). Its own small
// module so a browser page that shows a price with GST (Studio credits) never loads the monthly bill's engine.
// =============================================================================

import { applyBps, type Paise } from '@/domains/money/paise'
import { supplyKind } from '@/domains/tax/supply'
import { GST_BPS } from './gst-rate'

/**
 * GST on one of Frrata's own invoices: each head on the taxable value (plan finding 20), CGST + SGST when the buyer's
 * state is Frrata's own, IGST otherwise. Read by the monthly bill and by Studio credits (src/domains/studio/prices.ts).
 */
export function frrataGstHeads(taxable: Paise, frrataGstin: string | null, buyerState: string | null): { cgst: Paise; sgst: Paise; igst: Paise } {
  const intra = supplyKind(frrataGstin, buyerState) === 'intra'
  return {
    cgst: intra ? applyBps(taxable, GST_BPS / 2) : (0 as Paise),
    sgst: intra ? applyBps(taxable, GST_BPS / 2) : (0 as Paise),
    igst: intra ? (0 as Paise) : applyBps(taxable, GST_BPS),
  }
}
