// =============================================================================
// FILE: src/lib/db/schema-edits.ts
//
// AN ORDER'S ITEMS EDITED (order edit OE·1, docs/plans/2026-11-12-order-edit.md): one row per saved edit, and the
// lines it saw before and left after, with their prices — what Undo puts back and what "Was M" and Activity read. The
// order's lines themselves are never rewritten (order_lines.removed_at / replaced_by). Who and when are the edit's
// items_edited event (order_events); an undone edit is that event's undo, never a column here. Append-only.
// Access: drizzle/0118_order_edits_access.sql. Money in paise (ADR-0004).
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, money, tenants } from './schema'
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
  createdAt: createdAt(),
}, (t) => [
  unique('order_edits_tenant_id_key').on(t.tenantId, t.id),
  unique('order_edits_event').on(t.tenantId, t.eventId),
  foreignKey({ name: 'order_edits_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  // The event is this order's own (order_events_order_id_key).
  foreignKey({ name: 'order_edits_event_fk', columns: [t.tenantId, t.orderId, t.eventId], foreignColumns: [orderEvents.tenantId, orderEvents.orderId, orderEvents.id] }).onDelete('cascade'),
  index('order_edits_order').on(t.tenantId, t.orderId),
  check('order_edits_money', sql`${t.totalBefore} >= 0 and ${t.totalAfter} >= 0 and ${t.shippingBefore} >= 0 and ${t.shippingAfter} >= 0`),
  check('order_edits_offers', sql`cardinality(${t.offersRemoved}) <= 40 and cardinality(${t.offersAdded}) <= 40`),
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
  orderLineId: uuid('order_line_id').notNull(),
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
])
