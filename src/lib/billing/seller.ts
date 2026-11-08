import 'server-only'
import { fiscalYear } from '@/domains/counters/fiscal-year'
import { BILLING_TEST_ISSUE, FRRATA_ADDRESS, FRRATA_GSTIN, FRRATA_LEGAL_NAME, FRRATA_SAC } from '@/lib/env'

// =============================================================================
// FILE: src/lib/billing/seller.ts — FRRATA AS THE SUPPLIER (billing B2). Real only when its GSTIN, legal name, address
// and SAC are all set (the owner calls in the plan); otherwise test mode: a TEST series (the definers number it under
// "T26-27"), printed "Test — not a tax invoice", never collected by hand nor filed. Issuing in test mode is refused
// unless BILLING_TEST_ISSUE is set (never in Production: it would freeze real drafts as tests).
// =============================================================================

export type Seller = { name: string; gstin: string | null; address: string; sac: string; test: boolean; prefix: string; fy: string }

export function frrataSeller(now = new Date()): Seller {
  const real = !!FRRATA_GSTIN && !!FRRATA_LEGAL_NAME && !!FRRATA_ADDRESS && !!FRRATA_SAC
  const fy = fiscalYear(now)
  return real
    ? { name: FRRATA_LEGAL_NAME, gstin: FRRATA_GSTIN, address: FRRATA_ADDRESS, sac: FRRATA_SAC, test: false, prefix: 'FRR/', fy }
    : { name: FRRATA_LEGAL_NAME || 'Frrata (test mode)', gstin: null, address: FRRATA_ADDRESS || 'Not set yet', sac: FRRATA_SAC || '998315', test: true, prefix: 'FRR/', fy }
}

/** Frrata's GSTIN when real (it decides CGST + SGST or IGST on the draft); null in test mode. */
export const frrataGstin = () => FRRATA_GSTIN || null

/** Whether a test-mode issue may run here: a test database only (security review 2026-11-08). */
export const testIssueAllowed = () => BILLING_TEST_ISSUE === '1'
