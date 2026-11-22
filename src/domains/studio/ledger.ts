// =============================================================================
// FILE: src/domains/studio/ledger.ts — THE CREDIT LEDGER'S WORDS (C1·2; plan docs/plans/2026-11-22-c1-credits.md § Data).
// Pure. Every CHECK in src/lib/db/schema-credits.ts is built from these tuples, so the table and the code cannot drift.
//
// The ledger is `partner_credit_entries`, append-only: a LOT adds credits with a use-by date; a DRAW takes from (or
// gives back to) one lot. A partner's balance is the sum of its live lots and their draws; nothing else holds a figure
// (architecture M3; expiry is derived from the lot's use-by, never written, speed M2).
// =============================================================================

import { LOT_KINDS } from './credits'

export { LOT_KINDS }
/** reserve (−) when a use starts; release (+) of what it didn't use or a return; void (−) of farmed free credits;
 *  clawback (−) after a refund or a dispute. */
export const DRAW_KINDS = ['reserve', 'release', 'void', 'clawback'] as const
export const ENTRY_KINDS = [...LOT_KINDS, ...DRAW_KINDS] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]
/** Lots a purchase makes (one each, unique by purchase). */
export const BOUGHT_LOTS = ['pack', 'credits', 'seat'] as const

/** What a use is (V2a previews, V3 turns). */
export const USE_KINDS = ['preview', 'turn'] as const
/** A use's label: a fixed vocabulary, never free text from a brand (tenancy M5); words come from words.ts at render. */
export const USE_WHAT = ['start', 'looks', 'home', 'collection', 'product', 'page', 'edit', 'fix', 'preview', 'logo'] as const
export type UseWhat = (typeof USE_WHAT)[number]
/** Why a use came back whole (a Frrata-side failure returns its credits, spec § 8). */
export const RETURN_REASONS = ['frrata', 'timeout', 'cancelled'] as const

export const PURCHASE_KINDS = ['pack', 'credits', 'seat_start', 'seat_renewal'] as const
export type PurchaseKind = (typeof PURCHASE_KINDS)[number]
export const SEAT_METHODS = ['upi', 'card'] as const

/** Emails a partner gets (C1·6). Ids only in the queue; the words are made at send (tenancy H4). */
export const NOTICE_KINDS = ['low', 'budget_80', 'predebit', 'renewal_failed', 'paid', 'details_changed', 'lapsed'] as const
export type NoticeKind = (typeof NOTICE_KINDS)[number]

/** Where a day's USD/INR rate came from (owner 2026-11-22, 6; the source is still open: FBIL licence). */
export const RATE_SOURCES = ['fbil', 'frankfurter_fbil', 'manual'] as const

/** The person counters (security L1), each its own window in the definer. */
export const TRY_KINDS = ['buy', 'confirm', 'budget', 'details', 'alerts', 'seat', 'pdf', 'csv'] as const
