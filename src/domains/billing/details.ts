// =============================================================================
// FILE: src/domains/billing/details.ts — A SHOP'S BILLING DETAILS, checked (billing B1). Pure. Frrata's invoice to
// the shop carries these: the legal name and address it is billed to, its GSTIN when registered (validated, so the
// shop can claim the input tax), the State — the place of supply, which decides CGST + SGST or IGST — and where
// invoices are emailed. With a GSTIN, its first two digits ARE the state (gstinState); a different State is refused.
// =============================================================================

import { STATE_CODE, STATES } from '../checkout/states'
import { gstinValid } from '../settings/sections'
import { EMAIL_SHAPE } from '../signup/slug'
import { gstinState } from '../tax/gst'

export type BillingDetails = { legalName: string; gstin: string | null; address: string; stateCode: string; email: string }
export const STATE_OPTIONS: readonly (readonly [string, string])[] = STATES.map((s) => [STATE_CODE[s], `${s} (${STATE_CODE[s]})`] as const).sort((a, b) => a[1].localeCompare(b[1]))
const CODES = new Set(STATES.map((s) => STATE_CODE[s]))

export function parseBillingDetails(raw: Record<string, unknown>): { ok: true; value: BillingDetails } | { ok: false; errors: Record<string, string> } {
  const text = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '')
  const errors: Record<string, string> = {}
  const legalName = text('legalName'), address = text('address'), email = text('email').toLowerCase()
  const gstin = text('gstin').toUpperCase() || null
  let stateCode = text('stateCode')
  if (!legalName) errors.legalName = 'Needed: the name invoices are made out to.'
  else if (legalName.length > 200) errors.legalName = 'Up to 200 characters.'
  if (!address) errors.address = 'Needed: the address on your GST registration, or your business address.'
  else if (address.length > 400) errors.address = 'Up to 400 characters.'
  if (!email || !EMAIL_SHAPE.test(email) || email.length > 254) errors.email = 'An email address for invoices.'
  if (gstin && !gstinValid(gstin)) errors.gstin = 'Check the GSTIN: 15 characters, and the last one is a check digit.'
  if (gstin && gstinValid(gstin)) {
    const fromGstin = gstinState(gstin)!
    if (stateCode && stateCode !== fromGstin) errors.stateCode = `Your GSTIN is registered in state ${fromGstin}: the State must match it.`
    stateCode = fromGstin
  }
  if (!CODES.has(stateCode) && !errors.stateCode) errors.stateCode = 'Choose your State: it decides CGST and SGST, or IGST.'
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { legalName, gstin, address, stateCode, email } }
}
