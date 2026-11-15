// =============================================================================
// FILE: src/domains/partners/share.ts — the partner's share of what Frrata collected from a client store, one month.
// "What Frrata collects" is an issued, non-test invoice's taxable value less the taxable of its credit notes (ex GST),
// counted only once the invoice is paid (billing's own `invoiceState`). The month is the previous IST month; whole
// months count, the opening and closing ones included (owner, 2026-11-15, Q6; frata-unit-economics). Which months
// fall inside a link's window is decided in SQL per link (drizzle 0145, app_partner_client_shares): the lock.
// Statements (Phase 6) read this same rule. Pure.
// =============================================================================
import { invoiceState } from '@/domains/billing/status'
import { applyBpsFloor, paise, type Paise } from '@/domains/money/paise'

/** The month's invoice as the shares definer returns it: only what `invoiceState` takes, and the net taxable. */
export type ShareMonth = { issuedAt: Date | null; hasNumber: boolean; total: number; paid: number; credited: number; netTaxable: number }

/**
 * The share in RUPEES reaches the partner owner only once the merchant terms carry the disclosure (owner, 2026-11-15:
 * "Your partner sees what Frrata earns from your store." is on the handover page; the lawyer updates the terms). Until
 * the owner confirms the terms are updated it stays false: Clients shows "20% · ends <date>" and no rupee figure, and the
 * pages don't read the share's month at all. Turning it on is this one line.
 */
export const SHARE_IN_RUPEES = false

export type ShareFigure = { kind: 'paid'; amount: Paise } | { kind: 'due' } | { kind: 'none' }

/** The share of a net taxable value at the link's own rate, floored to the paisa (never more than Frrata collected). */
export function shareOf(netTaxable: number, bps: number): Paise {
  return applyBpsFloor(paise(netTaxable), bps)
}

/** One month's figure: paid → its share; due → "Due" (left out of totals); closed, credited, draft or none → nothing. */
export function monthShare(m: ShareMonth | null, bps: number): ShareFigure {
  if (!m) return { kind: 'none' }
  const { state } = invoiceState({ issuedAt: m.issuedAt, number: m.hasNumber ? 'x' : null, total: m.total }, m.paid, m.credited)
  if (state === 'due') return { kind: 'due' }
  if (state !== 'paid') return { kind: 'none' }
  return { kind: 'paid', amount: shareOf(m.netTaxable, bps) }
}

/** The header's "Your share ₹X last month": paid months only. */
export function shareTotal(figures: readonly ShareFigure[]): Paise {
  return paise(figures.reduce((a, f) => a + (f.kind === 'paid' ? f.amount : 0), 0))
}

/** What a partner may be shown of a month's figure: nothing in rupees until SHARE_IN_RUPEES (passed in, so tests read both). */
export function visibleShare(f: ShareFigure, inRupees: boolean): ShareFigure {
  return inRupees ? f : { kind: 'none' }
}
