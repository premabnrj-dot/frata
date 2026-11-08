// =============================================================================
// FILE: src/domains/billing/status.ts — WHERE A FRRATA INVOICE STANDS (billing B2). Pure; derived, never stored
// (plan finding 6): from the invoice's own timestamps, the payments captured and the credit notes against it.
// =============================================================================

export type InvoiceState = 'draft' | 'closed' | 'paid' | 'credited' | 'due'

/** `closed`: issued with nothing to collect (a rolled bill or a ₹0 month). `credited`: paid off by credit notes alone. */
export function invoiceState(i: { issuedAt: Date | null; number: string | null; total: number }, paid: number, credited: number): { state: InvoiceState; due: number } {
  if (!i.issuedAt) return { state: 'draft', due: 0 }
  if (!i.number) return { state: 'closed', due: 0 }
  const due = Math.max(0, i.total - paid - credited)
  if (due > 0) return { state: 'due', due }
  return { state: paid > 0 ? 'paid' : 'credited', due: 0 }
}

export const STATE_LABEL: Record<InvoiceState, string> = { draft: 'Draft', closed: 'Nothing to pay', paid: 'Paid', credited: 'Credited', due: 'Due' }
