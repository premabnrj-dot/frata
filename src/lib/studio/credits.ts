import 'server-only'
import type { UseWhat } from '@/domains/studio/ledger'
import type { PartnerOk } from '@/lib/auth/require-partner'
import { panel, reserve, system, type CreditError, type Panel, type Result } from '@/lib/db/partner-credits'
import { realMoney } from './purchase'

// =============================================================================
// FILE: src/lib/studio/credits.ts — THE ONE DOOR TO STUDIO CREDITS (C1·5; spec docs/specs/2026-11-16-studio-agent.md § 6.7 and
// § 8; plan C1·5 with the reviews of 2026-11-22). V2a's previews and V3's turns call these, nothing else:
//   - reserveCredits: a person starts a preview or a turn. The definer takes the partner from the person's live
//     membership, checks the store is a live link (and, for a Lead or Builder, theirs), the rate, the platform's day,
//     the person's day, the client's budget and the balance, in that order, under the partner's lock, and stores the
//     day's rate on the use. Money is real on Production: a test credit never pays there.
//   - settleCredits: after the work, the LIST cost the server measured (Managed Agents' usage, the build minutes) —
//     never a figure from a request or the model — charged at the stored rate, never above the reserve.
//   - returnCredits: Frrata's side failed, timed out or the person cancelled: every credit back.
//   - creditsOf: what a card or the Studio panel shows, read at render (no figure in a tenant row). A Lead or a Builder
//     gets the client's used and budget only.
// Settle and return are never server actions: they run in the code that measured the work, once per use.
// The turn- and site-keyed entries (a webhook's tool run, a developer's push preview) come with V3a and V2a.
// =============================================================================

export type Reserved = Result<{ useId: string; reserved: number }>

/** A person starts a preview or a turn: credits held now, charged after. */
export function reserveCredits(auth: PartnerOk, x: { linkId: string; kind: 'preview' | 'turn'; what: UseWhat; estimate: number | null }): Promise<Reserved> {
  return reserve(auth, { ...x, realMoney: realMoney() })
}

/** What the work cost, measured by our server, in micro-USD of list price. Returns the credits charged; null if settled. */
export function settleCredits(useId: string, listMicroUsd: bigint): Promise<number | null> {
  if (listMicroUsd < 0n) throw new Error('[credits] a cost below zero')
  return system.settle(useId, listMicroUsd)
}

/** Every credit back: a failure on Frrata's side, a timeout, or a cancel. False if the use was already closed. */
export function returnCredits(useId: string, reason: 'frrata' | 'timeout' | 'cancelled'): Promise<boolean> {
  return system.returnUse(useId, reason)
}

/** The figures a card or the Studio panel reads for one client. */
export function creditsOf(auth: PartnerOk, linkId: string): Promise<Result<Panel>> {
  return panel(auth, linkId, realMoney())
}

/** The refusals a caller turns into words (the page's actions hold them; Studio's will reuse the same). */
export type ReserveRefusal = Extract<CreditError, 'rate' | 'platform_day' | 'person_day' | 'budget' | 'balance' | 'not_found'>
