// =============================================================================
// FILE: src/domains/partners/next.ts — a client's next step and who takes it (P2 Clients). Pure: derived from the stage
// (stage.ts), the partner's own bills (bills.ts) and timestamps; never stored. The Clients rows, the drawer and the tab
// counts ("Needs you", "Waiting on the client") read this one function.
// =============================================================================
import type { ClientStage } from './stage'
import { daysBetween, renewsIn, RENEWS_SOON_DAYS, type BillSummary, type Deal } from './bills'
import type { PartnerRole } from './team'

export type Who = 'you' | 'client' | 'nobody'
export type NextAction = 'remind' | 'handOver' | 'recordBill'
export type NextReason = 'overdue' | 'building' | 'invited' | 'notOpen' | 'renews' | 'dueSoon' | 'open' | 'removed'

export type ClientNext = { who: Who; reason: NextReason; action: NextAction | null; days?: number }

export type NextFacts = {
  stage: ClientStage
  /** The owner's view only: the partner's bills and deal (null for a Lead). */
  bills: BillSummary | null
  deal: Deal | null
  /** IST day keys. */
  ownerSince: string | null
  inviteSentOn: string | null
}

/** Owner order: an overdue bill, building, invite sent, not opened, a retainer renewing, a bill due soon, open, removed. */
export function clientNext(f: NextFacts, role: PartnerRole, today: string): ClientNext | null {
  if (role === 'builder') return null
  const owner = role === 'owner'
  if (owner && f.bills?.oldestOverdueOn) return { who: 'you', reason: 'overdue', action: 'remind', days: daysBetween(f.bills.oldestOverdueOn, today) }
  if (f.stage === 'ended') return { who: 'nobody', reason: 'removed', action: null }
  if (f.stage === 'building') return { who: 'you', reason: 'building', action: owner ? 'handOver' : null }
  if (f.stage === 'invited') return { who: 'client', reason: 'invited', action: owner ? 'remind' : null, ...(f.inviteSentOn ? { days: daysBetween(f.inviteSentOn, today) } : {}) }
  if (f.stage === 'with_owner') return { who: 'client', reason: 'notOpen', action: owner ? 'remind' : null, ...(f.ownerSince ? { days: daysBetween(f.ownerSince, today) } : {}) }
  if (owner) {
    const r = renewsIn(f.deal, today)
    if (r !== null && r >= 0 && r <= RENEWS_SOON_DAYS) return { who: 'you', reason: 'renews', action: 'recordBill', days: r }
    if (f.bills && f.bills.dueSoon > 0) return { who: 'client', reason: 'dueSoon', action: null }
  }
  return { who: 'nobody', reason: 'open', action: null }
}
