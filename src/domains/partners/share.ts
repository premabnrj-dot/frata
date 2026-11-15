// =============================================================================
// FILE: src/domains/partners/share.ts — the partner's share of what Frrata collected from a client store, one month.
// "What Frrata collects" is an issued, non-test invoice's taxable value less the taxable of its credit notes (ex GST),
// counted only once the invoice is paid (billing's own `invoiceState`). The month is the previous IST month; whole
// months count, the opening and closing ones included (owner, 2026-11-15, Q6; frata-unit-economics). Which months
// fall inside a link's window is decided in SQL per link (drizzle 0145, app_partner_client_shares): the lock.
// Statements (Phase 6) read this same rule. Pure.
// =============================================================================
import { invoiceState } from '@/domains/billing/status'
import { paise, type Paise } from '@/domains/money/paise'

/** The month's invoice as the shares definer returns it: only what `invoiceState` takes, and the net taxable. */
export type ShareMonth = { issuedAt: Date | null; hasNumber: boolean; total: number; paid: number; credited: number; netTaxable: number }

export type ShareFigure = { kind: 'paid'; amount: Paise } | { kind: 'due' } | { kind: 'none' }

/** The share of a net taxable value at the link's own rate, floored to the paisa (never more than Frrata collected). */
export function shareOf(netTaxable: number, bps: number): Paise {
  return paise(Math.floor((Math.max(0, netTaxable) * bps) / 10_000))
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
