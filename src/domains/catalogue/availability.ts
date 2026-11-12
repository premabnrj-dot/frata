// =============================================================================
// FILE: src/domains/catalogue/availability.ts
//
// TWO QUESTIONS, KEPT APART (owner-approved product model, 2026-11-06):
//   status       — can shoppers FIND the product? set by the merchant.
//   availability — can they BUY this size and colour NOW? derived here from
//                  stock, the variant's "when it runs out" rule and dates.
// Never stored: a stored "sold out" disagrees with stock the moment one sells.
// Pure; `now` is passed in.
// =============================================================================

export type Status = 'draft' | 'active' | 'unlisted' | 'archived'
export type WhenOut = 'stop' | 'preorder' | 'made_to_order'

/** "Only N left" shows at or below this. Real stock only (CCPA false-urgency rule). */
export const LOW_STOCK_AT = 3

/** Pieces a shopper can still take: stock less what unpaid online orders hold and what placed orders still owe. One
 * rule for the product page, checkout's sold-out signal and a released hold (impact review 2026-11-12). */
export const freeStock = (v: { stock: number; held: number; owed: number }) => v.stock - v.held - v.owed

export type VariantFacts = { stock: number; whenOut: WhenOut; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; preorderCap: number | null; preordered?: number }
export type Availability =
  | { kind: 'in_stock'; canBuy: true; label: string; google: 'in_stock' }
  | { kind: 'low_stock'; canBuy: true; label: string; left: number; google: 'in_stock' }
  | { kind: 'sold_out'; canBuy: false; label: string; google: 'out_of_stock' }
  | { kind: 'preorder'; canBuy: true; label: string; shipsBy: string; google: 'preorder'; availabilityDate: string }
  | { kind: 'made_to_order'; canBuy: true; label: string; leadDays: [number, number]; google: 'in_stock' }

const day = (iso: string) => new Date(`${iso}T00:00:00+05:30`)
const fmt = (iso: string) => day(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

export function availability(v: VariantFacts, now: Date): Availability {
  if (v.stock > LOW_STOCK_AT) return { kind: 'in_stock', canBuy: true, label: 'In stock', google: 'in_stock' }
  if (v.stock > 0) return { kind: 'low_stock', canBuy: true, left: v.stock, label: `Only ${v.stock} left`, google: 'in_stock' }
  if (v.whenOut === 'preorder' && v.shipsBy && day(v.shipsBy) > now && (v.preorderCap === null || (v.preordered ?? 0) < v.preorderCap)) {
    return { kind: 'preorder', canBuy: true, shipsBy: v.shipsBy, label: `Pre-order · ships by ${fmt(v.shipsBy)}`, google: 'preorder', availabilityDate: `${v.shipsBy}T00:00:00+05:30` }
  }
  if (v.whenOut === 'made_to_order' && v.leadMinDays && v.leadMaxDays) {
    return { kind: 'made_to_order', canBuy: true, leadDays: [v.leadMinDays, v.leadMaxDays], label: `Made to order · ships in ${v.leadMinDays}–${v.leadMaxDays} days`, google: 'in_stock' }
  }
  return { kind: 'sold_out', canBuy: false, label: 'Sold out', google: 'out_of_stock' }
}

/** What a product's status means for shoppers, search and feeds at this moment. */
export function visibility(status: Status, publishAt: Date | null, now: Date) {
  const scheduled = status === 'active' && publishAt !== null && publishAt > now
  const live = (status === 'active' && !scheduled) || status === 'unlisted'
  return {
    scheduled,
    /** Opens at its address. */
    reachable: live,
    /** In menus, collections, search, the sitemap, Google and Meta. */
    listed: status === 'active' && !scheduled,
    indexable: status === 'active' && !scheduled,
    canBuy: live,
    /** What a shopper gets at its address: 200, or 404. Archived (`gone`) instead says "no longer available", noindex — never a redirect to an unrelated page, which Google reads as a soft 404 (storefront review 2026-11-07). An OLD handle is a 308, decided by the page. */
    http: live ? 200 : 404,
    gone: status === 'archived',
  } as const
}

/** The label a merchant reads for a status (with scheduling). */
export function statusLabel(status: Status, publishAt: Date | null, now: Date): string {
  if (visibility(status, publishAt, now).scheduled) return 'Scheduled'
  return { draft: 'Draft', active: 'Active', unlisted: 'Unlisted', archived: 'Archived' }[status]
}

/** What a product offers shoppers, the best of its sizes: one in stock, else one that sells at 0 (pre-order, made to
 *  order), else the first (sold out). Null for none. Products' list badge (PR·0: it said Sold out for made to order). */
export function bestOffer(vs: readonly VariantFacts[], now: Date): Availability | null {
  const all = vs.map((v) => availability(v, now))
  return all.find((a) => a.kind === 'in_stock' || a.kind === 'low_stock') ?? all.find((a) => a.canBuy) ?? all[0] ?? null
}
