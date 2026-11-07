// =============================================================================
// FILE: src/domains/orders/work.ts
//
// WHAT A MERCHANT MAY DO TO AN ORDER, AND WHO (docs/specs/2026-11-07-orders.md
// § 1D·3, "Who may do what"). Read by the actions (the guard — each passes
// ROLES[action] to asMember), the order page (its one primary action and the
// More menu) and the queue's keys, so a button and its refusal never disagree.
// Pure.
// =============================================================================

import { ANY_MEMBER, CAN_MANAGE, type MemberRole } from '@/domains/tenancy/roles'
import type { OrderState } from './order-state'

export const ACTIONS = ['confirm', 'hold', 'unhold', 'undo', 'note', 'pack', 'print', 'edit', 'cancel'] as const
export type OrderAction = (typeof ACTIONS)[number]

const STAFF: readonly MemberRole[] = ANY_MEMBER
const MANAGERS: readonly MemberRole[] = CAN_MANAGE

/** Roles per action. Support sessions act as the owner (ADR-0007) and are audited. */
export const ROLES: Record<OrderAction, readonly MemberRole[]> = {
  confirm: STAFF, hold: STAFF, unhold: STAFF, undo: STAFF, note: STAFF, pack: STAFF, print: STAFF,
  edit: MANAGERS, cancel: MANAGERS,
}

/** The states each action applies to. */
const WHEN: Record<Exclude<OrderAction, 'undo'>, readonly OrderState[]> = {
  confirm: ['unconfirmed', 'held'],
  hold: ['unconfirmed', 'confirmed', 'paid'],
  unhold: ['held'],
  note: ['unconfirmed', 'held', 'confirmed', 'paid', 'refund_due', 'packed', 'cancelled', 'shipped', 'ndr', 'delivered', 'rto', 'rto_received'],
  pack: ['confirmed', 'paid'],
  edit: ['unconfirmed', 'held', 'confirmed', 'paid'],
  cancel: ['unconfirmed', 'held', 'confirmed', 'paid', 'refund_due', 'packed'],
  // The packing slip: to pick and pack, and to reprint while it is with the courier. Never once cancelled, returned
  // or delivered (a cancelled COD slip once read "collect nothing"). The invoice is not an action: it prints
  // whenever one was issued, a cancelled one stamped CANCELLED.
  print: ['confirmed', 'paid', 'packed', 'shipped', 'ndr'],
}

/** Whether `action` applies to an order in `state` (roles aside). Undo is checked against its event. */
export function applies(action: OrderAction, state: OrderState): boolean {
  if (action === 'undo') return true
  return WHEN[action].includes(state)
}

/** Whether this member may do it: the action applies and the role allows it. */
export const may = (action: OrderAction, state: OrderState, role: MemberRole) => applies(action, state) && ROLES[action].includes(role)

/**
 * The ONE primary action in the order page's header (design-language § Work queues 3). A held order whose
 * payment was online is confirmed (released) the same way. Refund due: the only way forward is to cancel.
 */
export function primaryAction(state: OrderState): 'confirm' | 'pack' | 'print_slip' | 'cancel' | null {
  if (state === 'unconfirmed' || state === 'held') return 'confirm'
  if (state === 'confirmed' || state === 'paid') return 'pack'
  if (state === 'packed') return 'print_slip'
  if (state === 'refund_due') return 'cancel'
  return null
}

// ── Cancelling ──

export const CANCEL_REASONS = ['fake', 'customer_cancelled', 'unreachable', 'out_of_stock', 'cant_deliver', 'other'] as const
export type CancelReason = (typeof CANCEL_REASONS)[number]
export const CANCEL_LABEL: Record<CancelReason, string> = {
  fake: 'Fake order', customer_cancelled: 'Customer cancelled', unreachable: "Couldn't reach", out_of_stock: 'Out of stock',
  cant_deliver: "Can't deliver there", other: 'Other',
}

// ── The invoice number (GST Rule 46: ≤ 16 characters, unique within the financial year) ──

export const MAX_INVOICE = 16

/**
 * "KS/26-27/00001" for a tax invoice, "KS/26-27/B0001" for a bill of supply (its own series and counter).
 * `series` is the shop's prefix as set (≤ 5 characters, e.g. "KS/"); empty → the order prefix and a slash.
 * Throws past 16 characters rather than issue a number GST would refuse (the CHECK on orders refuses it too).
 */
function compose(o: { series: string; orderPrefix: string; fiscalYear: string; n: number; kind: 'invoice' | 'bill' }): string {
  const series = o.series || `${o.orderPrefix}/`
  const sep = /[/-]$/.test(series) ? '' : '/'
  const tail = o.kind === 'bill' ? `B${String(o.n).padStart(4, '0')}` : String(o.n).padStart(5, '0')
  return `${series}${sep}${o.fiscalYear}/${tail}`
}

/** The most a year can number, per kind, inside 16 characters: 99,999 tax invoices, 9,999 bills of supply. */
export const MAX_IN_YEAR = { invoice: 99_999, bill: 9_999 } as const

export class InvoiceNumberTooLong extends Error {}

export function invoiceNumber(o: { series: string; orderPrefix: string; fiscalYear: string; n: number; kind: 'invoice' | 'bill' }): string {
  const out = compose(o)
  if (out.length > MAX_INVOICE) throw new InvoiceNumberTooLong(`invoice number ${out} is longer than ${MAX_INVOICE} characters`)
  return out
}

/**
 * Whether a series leaves room for the whole year's numbers (architecture review 2026-11-07: "KESRI" made
 * "KESRI/26-27/00001", 17 characters, and every Mark packed failed). Settings refuses a series that does not fit.
 */
export const seriesFits = (series: string) =>
  (['invoice', 'bill'] as const).every((kind) => compose({ series, orderPrefix: 'XXXX', fiscalYear: '26-27', n: MAX_IN_YEAR[kind], kind }).length <= MAX_INVOICE)
