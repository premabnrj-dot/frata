// =============================================================================
// FILE: src/lib/db/schema-edits.ts
//
// AN ORDER'S ITEMS EDITED (order edit OE·1, docs/plans/2026-11-12-order-edit.md): one row per saved edit, and the
// lines it saw before and left after, with their prices — what Undo puts back and what "Was M" and Activity read. The
// order's lines themselves are never rewritten (order_lines.removed_at / replaced_by). Who and when are the edit's
// items_edited event (order_events); an undone edit is that event's undo, never a column here. Append-only, except what
// a paid order's edit settles later (OE·2): a higher total waits for the shopper's payment (`asked`), and its record is
// filled in once that is paid or dropped. A refund is its own row per attempt (order_refunds).
// Access: drizzle/0118_order_edits_access.sql, drizzle/0121_order_refunds_access.sql. Money in paise (ADR-0004).
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, money, tenants } from './schema'
import { orderEvents, orderLines, orders } from './schema-orders'

export const orderEdits = pgTable('order_edits', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull(),
  /** The items_edited event: who and when, and what an Undo names. */
  eventId: uuid('event_id').notNull(),
  totalBefore: money('total_before').notNull(),
  totalAfter: money('total_after').notNull(),
  /** The delivery charge before and after (free delivery can come off, or the shop's threshold be crossed). */
  shippingBefore: money('shipping_before').notNull(),
  shippingAfter: money('shipping_after').notNull(),
  /** The merchant ticked "Email the new total" (the email waits for the Undo window). */
  notify: boolean('notify').notNull(),
  /** The order_discounts rows this edit took off, and the rows it added (an offer giving another amount now). Ids only,
   *  with no FK (Postgres has none for array elements): Undo reads them only together with this order and tenant
   *  (`order_id` and `tenant_id` in every where), so another shop's or order's row is never touched. */
  offersRemoved: uuid('offers_removed').array().notNull().default(sql`'{}'::uuid[]`),
  offersAdded: uuid('offers_added').array().notNull().default(sql`'{}'::uuid[]`),
  /** Paid online and the new total is higher by ₹1 or more (OE·2, owner 2026-11-12): what the shopper is asked to pay
   *  first. Null: the edit applied when it was saved. While it waits (not paid, not dropped, the order not cancelled)
   *  nothing on the order changes; its new pieces are held (order_edit_lines.held). */
  asked: money('asked'),
  /** The second Razorpay order the difference is paid through (receipt `${number}-e${id8}`), made when the shopper first
   *  taps Pay; and the payment that paid it. */
  razorpayOrderId: text('razorpay_order_id'),
  razorpayPaymentId: text('razorpay_payment_id'),
  /** That payment applied: the edit took effect (its lines, offers and money written then). */
  paidAt: at('paid_at'),
  /** The request dropped: the merchant shipped without the change, or the edit could no longer apply when paid. */
  droppedAt: at('dropped_at'),
  droppedReason: text('dropped_reason'),
  /** Razorpay's fee on the second payment, with its GST (added to the order's gateway_fee: profit per order). */
  gatewayFee: money('gateway_fee'),
  gatewayTax: money('gateway_tax'),
  createdAt: createdAt(),
}, (t) => [
  unique('order_edits_tenant_id_key').on(t.tenantId, t.id),
  // A refund names an edit of its own order (order_refunds_edit_fk).
  unique('order_edits_order_id_key').on(t.tenantId, t.orderId, t.id),
  unique('order_edits_event').on(t.tenantId, t.eventId),
  foreignKey({ name: 'order_edits_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  // The event is this order's own (order_events_order_id_key).
  foreignKey({ name: 'order_edits_event_fk', columns: [t.tenantId, t.orderId, t.eventId], foreignColumns: [orderEvents.tenantId, orderEvents.orderId, orderEvents.id] }).onDelete('cascade'),
  index('order_edits_order').on(t.tenantId, t.orderId),
  check('order_edits_money', sql`${t.totalBefore} >= 0 and ${t.totalAfter} >= 0 and ${t.shippingBefore} >= 0 and ${t.shippingAfter} >= 0`),
  check('order_edits_offers', sql`cardinality(${t.offersRemoved}) <= 40 and cardinality(${t.offersAdded}) <= 40`),
  // Razorpay's minimum is ₹1: a smaller difference is not asked for (the edit applies at once).
  check('order_edits_asked', sql`${t.asked} is null or ${t.asked} >= 100`),
  check('order_edits_settled', sql`(${t.paidAt} is null or (${t.asked} is not null and ${t.razorpayPaymentId} is not null and ${t.droppedAt} is null))
    and (${t.droppedAt} is null or (${t.asked} is not null and ${t.droppedReason} in ('ship_without','cannot_apply')))
    and (${t.razorpayOrderId} is null or ${t.asked} is not null) and (${t.gatewayFee} is null or ${t.gatewayFee} >= 0)`),
  uniqueIndex('order_edits_razorpay').on(t.tenantId, t.razorpayOrderId).where(sql`${t.razorpayOrderId} is not null`),
  // One request waiting per order (an order with one can't be edited again until it is paid or dropped).
  uniqueIndex('order_edits_one_waiting').on(t.tenantId, t.orderId).where(sql`${t.asked} is not null and ${t.paidAt} is null and ${t.droppedAt} is null`),
])

/**
 * The order's live lines as the edit found them (`before`) and left them (`after`): the line, its variant, quantity and
 * money as they were. A line in `before` and not in `after` came out (with the merchant's reason); one in `after` and not
 * in `before` was added or is what a swapped or changed line became. Undo puts `before` back exactly.
 */
export const orderEditLines = pgTable('order_edit_lines', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  editId: uuid('edit_id').notNull(),
  side: text('side').notNull(),
  /** Null only on an `after` line of an edit waiting for payment: the line it becomes is inserted when it is paid. */
  orderLineId: uuid('order_line_id'),
  /** The variant then (FK to this shop's variants, set null when one is deleted: 0118, as order_lines'). */
  variantId: uuid('variant_id'),
  qty: integer('qty').notNull(),
  unitPrice: money('unit_price').notNull(),
  productDiscount: money('product_discount').notNull(),
  lineDiscount: money('line_discount').notNull(),
  /** A line that came out: why (EDIT_REASONS, src/domains/orders/edit.ts; the merchant's, never shown to the shopper). */
  reason: text('reason'),
  /** An `after` line that a swap or a new quantity made: the `before` line it replaced (the record stays whole after an
   *  Undo clears order_lines.replaced_by). */
  replaces: uuid('replaces'),
  /** An edit waiting for payment: the in-stock pieces of this line held for the shopper (off sale, as an online order's
   *  hold) until it is paid or dropped. */
  held: integer('held').notNull().default(0),
}, (t) => [
  foreignKey({ name: 'order_edit_lines_edit_fk', columns: [t.tenantId, t.editId], foreignColumns: [orderEdits.tenantId, orderEdits.id] }).onDelete('cascade'),
  foreignKey({ name: 'order_edit_lines_line_fk', columns: [t.tenantId, t.orderLineId], foreignColumns: [orderLines.tenantId, orderLines.id] }).onDelete('cascade'),
  unique('order_edit_lines_once').on(t.tenantId, t.editId, t.side, t.orderLineId),
  index('order_edit_lines_line').on(t.tenantId, t.orderLineId),
  check('order_edit_lines_side', sql`${t.side} in ('before','after')`),
  foreignKey({ name: 'order_edit_lines_replaces_fk', columns: [t.tenantId, t.replaces], foreignColumns: [orderLines.tenantId, orderLines.id] }).onDelete('cascade'),
  check('order_edit_lines_reason', sql`${t.reason} is null or (${t.side} = 'before' and ${t.reason} in ('out_of_stock','customer_asked','other'))`),
  check('order_edit_lines_replaces', sql`${t.replaces} is null or (${t.side} = 'after' and ${t.replaces} <> ${t.orderLineId})`),
  check('order_edit_lines_money', sql`${t.qty} between 1 and 10 and ${t.unitPrice} >= 0 and ${t.productDiscount} >= 0 and ${t.lineDiscount} >= ${t.productDiscount}`),
  check('order_edit_lines_held', sql`${t.held} between 0 and ${t.qty} and (${t.held} = 0 or ${t.side} = 'after') and (${t.orderLineId} is not null or ${t.side} = 'after')`),
  // What checkout holds per variant (heldSql): only rows holding something.
  index('order_edit_lines_held_variant').on(t.tenantId, t.variantId).where(sql`${t.held} > 0`),
])

/**
 * A refund the shop's own Razorpay sends to the shopper (OE·2): one row per ATTEMPT, written before the request
 * (ADR-0006) — the outbox row `refund.send` carries its id. Its stage is derived from its moments (refundStage,
 * src/domains/orders/refunds.ts), never stored: queued → sending (claimed, committed before the call) → sent (Razorpay
 * accepted: pending) → processed; or cancelled (an Undo before it was claimed), or failed (Razorpay refused it, or
 * failed it later) with our code. A failed attempt is tried again as a NEW row (`retry_of`): a new receipt and key.
 * Per Razorpay payment: what can still be refunded = captured − the attempts that count (queued, sending, sent, processed).
 */
export const REFUND_CAUSES = ['edit', 'after_drop', 'old_order'] as const
export const REFUND_FAILURES = ['balance', 'too_old', 'disabled', 'over', 'keys', 'refused', 'failed'] as const
export const orderRefunds = pgTable('order_refunds', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull(),
  /** The edit it settles (a lower total, or a payment for a request dropped since); null: a payment on the order's
   *  first Razorpay order after its items changed (old_order). */
  editId: uuid('edit_id'),
  /** Why: an edit lowered the total; a payment came after its request was dropped or the order cancelled; a payment on
   *  the order's first Razorpay order at its old total after an edit (never marks the order paid). */
  cause: text('cause').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').notNull(),
  amount: money('amount').notNull(),
  /** The attempt this one tries again. */
  retryOf: uuid('retry_of'),
  notBefore: at('not_before').notNull(),
  cancelledAt: at('cancelled_at'),
  /** Claimed by the sender, committed before Razorpay is called: an Undo can no longer cancel it. */
  sendingAt: at('sending_at'),
  razorpayRefundId: text('razorpay_refund_id'),
  sentAt: at('sent_at'),
  processedAt: at('processed_at'),
  failedAt: at('failed_at'),
  /** Our code for why it failed (REFUND_FAILURES), never Razorpay's words. */
  failure: text('failure'),
  /** A failed `edit` refund a later change of the same order settled instead (its new total was worked out without this
   *  money going back): never tried again. */
  supersededBy: uuid('superseded_by'),
  /** A payment refunded in full (after_drop, old_order), on its first attempt: Razorpay's fee on it, with its GST — kept by
   *  Razorpay, so added to the order's gateway_fee (profit per order). Written once. */
  gatewayFee: money('gateway_fee'),
  gatewayTax: money('gateway_tax'),
  createdAt: createdAt(),
}, (t) => [
  unique('order_refunds_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'order_refunds_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  foreignKey({ name: 'order_refunds_retry_fk', columns: [t.tenantId, t.retryOf], foreignColumns: [t.tenantId, t.id] }).onDelete('restrict'),
  foreignKey({ name: 'order_refunds_edit_fk', columns: [t.tenantId, t.orderId, t.editId], foreignColumns: [orderEdits.tenantId, orderEdits.orderId, orderEdits.id] }).onDelete('cascade'),
  foreignKey({ name: 'order_refunds_superseded_fk', columns: [t.tenantId, t.orderId, t.supersededBy], foreignColumns: [orderEdits.tenantId, orderEdits.orderId, orderEdits.id] }).onDelete('cascade'),
  index('order_refunds_order').on(t.tenantId, t.orderId),
  index('order_refunds_payment').on(t.tenantId, t.razorpayPaymentId),
  uniqueIndex('order_refunds_razorpay').on(t.tenantId, t.razorpayRefundId).where(sql`${t.razorpayRefundId} is not null`),
  // One retry per failed attempt.
  uniqueIndex('order_refunds_retry').on(t.tenantId, t.retryOf).where(sql`${t.retryOf} is not null`),
  check('order_refunds_cause', sql`${t.cause} in ('edit','after_drop','old_order') and (${t.editId} is not null or ${t.cause} = 'old_order')`),
  check('order_refunds_amount', sql`${t.amount} >= 100`),
  check('order_refunds_payment_id', sql`${t.razorpayPaymentId} ~ '^pay_[A-Za-z0-9]{6,40}$'`),
  check('order_refunds_failure', sql`(${t.failure} is null) = (${t.failedAt} is null) and (${t.failure} is null or ${t.failure} in ('balance','too_old','disabled','over','keys','refused','failed'))`),
  check('order_refunds_moments', sql`(${t.cancelledAt} is null or (${t.sendingAt} is null and ${t.sentAt} is null))
    and (${t.sentAt} is null or (${t.sendingAt} is not null and ${t.razorpayRefundId} is not null))
    and (${t.processedAt} is null or ${t.sentAt} is not null) and (${t.processedAt} is null or ${t.failedAt} is null)`),
  check('order_refunds_superseded', sql`${t.supersededBy} is null or (${t.failedAt} is not null and ${t.cause} = 'edit')`),
  check('order_refunds_fee', sql`(${t.gatewayFee} is null or (${t.gatewayFee} >= 0 and ${t.retryOf} is null and ${t.cause} <> 'edit')) and (${t.gatewayTax} is null or ${t.gatewayTax} >= 0)`),
])
