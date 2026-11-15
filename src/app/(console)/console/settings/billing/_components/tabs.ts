// Plan and billing's tabs (billing rework R1; mockup docs/mockups/2026-11-15-billing-rework/ § tabs): the tab is in
// the address (?tab=), so a link, a reload and the back button keep it. Only these words; anything else is Overview.
export const BILLING_TABS = [['overview', 'Overview'], ['charges', 'Charges'], ['plans', 'Plans'], ['invoices', 'Invoices'], ['payment', 'Payment'], ['details', 'Details']] as const
export type BillingTab = (typeof BILLING_TABS)[number][0]

export const tabOf = (v: unknown): BillingTab => (BILLING_TABS.some(([k]) => k === v) ? (v as BillingTab) : 'overview')

/** The tab's address, with only the extras that tab reads (a bill, a page of orders, a filter). */
export function billingHref(tab: BillingTab, extra: Record<string, string | number | undefined> = {}): string {
  const q = new URLSearchParams(tab === 'overview' ? {} : { tab })
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return `/console/settings/billing${s ? `?${s}` : ''}`
}

/** A bill picked on Charges: 'open' (the bill still growing) or an issued bill's id. */
export const billOf = (v: unknown): string => (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) ? v : 'open')
export const pageOf = (v: unknown): number => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < 1000 ? n : 0 }
