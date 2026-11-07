// =============================================================================
// FILE: src/domains/partners/terms.ts — the partner terms, once.
//
// Owner, 2026-11-07: the merchant owns the store; the partner earns 20% of what
// Frrata collects from it for 24 months. O1–O3 taken as recommended (plan
// docs/plans/2026-11-07-partners.md): the months start when the shop FIRST
// opens, the share runs 90 days after the merchant removes the partner, and a
// partner has at most 10 stores that have not opened yet. Each store's link
// snapshots these at creation, so a later change never rewrites a store's terms.
// =============================================================================

export const PARTNER_TERMS = {
  version: 1,
  shareBps: 2000,
  shareMonths: 24,
  noticeDays: 90,
  maxUnopened: 10,
} as const

/** What a partner says they do, on the application (the partners.services CHECK is built from this). */
export const PARTNER_SERVICES = [
  ['setup', 'Store setup'],
  ['design', 'Design'],
  ['photos', 'Product photos'],
  ['catalogue', 'Catalogue'],
  ['ads', 'Ads and Instagram'],
] as const
export type PartnerService = (typeof PARTNER_SERVICES)[number][0]

export const BRANDS_NOW = [['0', 'None yet'], ['1-4', '1–4'], ['5-14', '5–14'], ['15+', '15+']] as const
export type BrandsNow = (typeof BRANDS_NOW)[number][0]
