// =============================================================================
// FILE: src/domains/partners/bills.ts — a partner's OWN billing to its clients (P2 Clients, docs/plans/2026-11-16-p2-clients.md).
// The partner's private book: Frrata never sends, collects or reads it. Pure: a bill's state is derived from its due
// day and paid time, never stored. Money is integer paise (ADR-0004); days are IST keys ("2026-11-16", day.ts).
// =============================================================================
import { paise, type Paise } from '@/domains/money/paise'

export type DealKind = 'project' | 'retainer'
export type Deal = { kind: DealKind; amount: Paise; renewsOn: string | null }
/** An unpaid bill as the list reads it (the summary definer returns unpaid bills only). */
export type OpenBill = { amount: Paise; dueOn: string }
export type Bill = OpenBill & { id: string; label: string; number: string | null; paidAt: Date | null }

export type BillState = 'paid' | 'overdue' | 'due' | 'later'

/** How many days ahead an unpaid bill counts as "due" (the Unpaid tab and the client's next step). */
export const DUE_SOON_DAYS = 7
/** A retainer renewing this close asks for its next bill. */
export const RENEWS_SOON_DAYS = 14
/** The partner's own caps, the same as the column CHECK and the definers: ₹1 to ₹10 crore; 500 bills a client. */
export const MAX_BILL_PAISE = 10_000_000_000
export const MAX_BILLS_PER_CLIENT = 500

const DAY = 86_400_000
const ms = (key: string) => Date.parse(`${key}T00:00:00Z`)
/** Whole days from `a` to `b` (IST day keys). */
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY)

export function billState(b: { dueOn: string; paidAt?: Date | null }, today: string): BillState {
  if (b.paidAt) return 'paid'
  const d = daysBetween(today, b.dueOn)
  if (d < 0) return 'overdue'
  return d <= DUE_SOON_DAYS ? 'due' : 'later'
}

export type BillSummary = {
  unpaid: Paise
  overdue: Paise
  /** The oldest overdue bill's due day: "₹12,000 overdue · 11 days" counts from it. */
  oldestOverdueOn: string | null
  dueSoon: Paise
  /** The nearest unpaid bill not yet overdue. */
  nextDueOn: string | null
  nextDue: Paise
}

/** One client's unpaid bills, summed by state. */
export function summarise(open: readonly OpenBill[], today: string): BillSummary {
  let unpaid = 0, overdue = 0, dueSoon = 0, nextDue = 0
  let oldestOverdueOn: string | null = null, nextDueOn: string | null = null
  for (const b of open) {
    unpaid += b.amount
    const s = billState(b, today)
    if (s === 'overdue') { overdue += b.amount; if (!oldestOverdueOn || b.dueOn < oldestOverdueOn) oldestOverdueOn = b.dueOn; continue }
    if (s === 'due') dueSoon += b.amount
    if (!nextDueOn || b.dueOn < nextDueOn) { nextDueOn = b.dueOn; nextDue = b.amount } else if (b.dueOn === nextDueOn) nextDue += b.amount
  }
  return { unpaid: paise(unpaid), overdue: paise(overdue), oldestOverdueOn, dueSoon: paise(dueSoon), nextDueOn, nextDue: paise(nextDue) }
}

/** Days until a retainer renews, or null when it isn't a retainer with a date. */
export function renewsIn(deal: Deal | null, today: string): number | null {
  if (!deal || deal.kind !== 'retainer' || !deal.renewsOn) return null
  return daysBetween(today, deal.renewsOn)
}

/** "Retainers ₹47,000 a month": retainer deals of clients not removed (a project is one-off; a removed client pays no more). */
export function retainersMonthly(clients: readonly { deal: Deal | null; removed: boolean }[]): Paise {
  return paise(clients.reduce((a, c) => a + (!c.removed && c.deal?.kind === 'retainer' ? c.deal.amount : 0), 0))
}

/** "Unpaid ₹40,500": every client's unpaid bills, removed ones too (a final bill is still owed). */
export function unpaidTotal(summaries: readonly BillSummary[]): Paise {
  return paise(summaries.reduce((a, s) => a + s.unpaid, 0))
}
