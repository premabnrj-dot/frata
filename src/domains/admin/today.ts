// =============================================================================
// FILE: src/domains/admin/today.ts — WHAT WAITS ON FRRATA STAFF (Neel N4, owner-approved mockup "Today"; plan
// docs/plans/2026-11-15-neel-n4-admin.md, reviews folded in). The one list of sources: who may see each, which nav item
// counts it, its chip. A source a person may not see is never read (src/lib/admin/today.ts filters before reading).
// Oldest first; the nav counts are the same items, counted by area. Pure.
// =============================================================================

export type StaffRoleName = 'admin' | 'support'

export type TodayKind = 'partner_passkey' | 'staff_passkey' | 'partner_review' | 'address_claim' | 'overpaid' | 'issue_run' | 'trial_ending' | 'owner_waiting' | 'theme_new' | 'site_no_reads' | 'cost_due' | 'cash_low'
export type TodayArea = 'today' | 'merchants' | 'trials' | 'names' | 'partners' | 'staff' | 'billing' | 'costs' | 'cash' | 'themes' | 'storefront_api'
export type TodayTone = 'warn' | 'bad' | 'info'

export type TodaySource = { kind: TodayKind; area: Exclude<TodayArea, 'today'>; roles: readonly StaffRoleName[]; chip: string; tone: TodayTone }

const MASTER = ['admin'] as const
const ALL = ['admin', 'support'] as const

/** In the order a tie is shown. Money and access first. */
export const TODAY_SOURCES: readonly TodaySource[] = [
  { kind: 'partner_passkey', area: 'partners', roles: MASTER, chip: 'Passkey', tone: 'warn' },
  { kind: 'staff_passkey', area: 'staff', roles: MASTER, chip: 'Passkey', tone: 'warn' },
  { kind: 'overpaid', area: 'billing', roles: MASTER, chip: 'Invoice', tone: 'bad' },
  { kind: 'issue_run', area: 'billing', roles: MASTER, chip: 'Billing', tone: 'info' },
  // Admin › Costs (plan 2026-11-23-admin-costs.md C2): a repeating cost overdue or due within a week. Money: master admins only.
  { kind: 'cost_due', area: 'costs', roles: MASTER, chip: 'Cost', tone: 'warn' },
  // Admin › Cashflow (plan 2026-11-23-admin-cashflow.md R2): a coming month closes below the minimum cash. Money: master admins only.
  { kind: 'cash_low', area: 'cash', roles: MASTER, chip: 'Cash', tone: 'warn' },
  { kind: 'address_claim', area: 'names', roles: ALL, chip: 'Address', tone: 'warn' },
  { kind: 'partner_review', area: 'partners', roles: ALL, chip: 'Partner', tone: 'info' },
  { kind: 'trial_ending', area: 'trials', roles: MASTER, chip: 'Trial', tone: 'warn' },
  { kind: 'owner_waiting', area: 'merchants', roles: ALL, chip: 'Merchant', tone: 'warn' },
  { kind: 'theme_new', area: 'themes', roles: ALL, chip: 'Theme', tone: 'info' },
  // SA1b: an open store whose own website hasn't read the API for 2 days (its site likely shows nothing).
  { kind: 'site_no_reads', area: 'storefront_api', roles: ALL, chip: 'Website', tone: 'warn' },
]

export const sourcesFor = (role: StaffRoleName): TodaySource[] => TODAY_SOURCES.filter((s) => s.roles.includes(role))
export const sourceOf = (kind: TodayKind): TodaySource => TODAY_SOURCES.find((s) => s.kind === kind)!

export type TodayItem = {
  kind: TodayKind
  /** Unique within its kind (a row's key). */
  key: string
  /** The store it is about, when it is about one (Merchants' Needs column reads it). */
  tenantId?: string
  /** The need in a few words, for a store's row ("Owner hasn't signed in"); set with tenantId. */
  need?: string
  /** The fact, said first: "Pia Mehta asks for a first passkey". */
  title: string
  line: string
  /** The one action's words: "Approve passkey". */
  action: string
  href: string
  /** When it started waiting; null sorts last. */
  since: Date | null
}

/** Oldest first; a tie keeps the source order. */
export function orderItems(items: TodayItem[]): TodayItem[] {
  const rank = new Map(TODAY_SOURCES.map((s, i) => [s.kind, i]))
  return [...items].sort((a, b) => {
    const ta = a.since?.getTime() ?? Infinity, tb = b.since?.getTime() ?? Infinity
    return ta !== tb ? ta - tb : (rank.get(a.kind)! - rank.get(b.kind)!)
  })
}

/** The nav: how many wait in each area, and in all. A source that could not be read is "uncounted" (absent), never 0. */
export function countsOf(items: TodayItem[]): Partial<Record<TodayArea, number>> {
  const out: Partial<Record<TodayArea, number>> = {}
  for (const i of items) { const a = sourceOf(i.kind).area; out[a] = (out[a] ?? 0) + 1 }
  if (items.length) out.today = items.length
  return out
}
