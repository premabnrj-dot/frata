// =============================================================================
// FILE: src/lib/db/schema-orders.ts
//
// ORDERS (1C): the order with its money and promises, its lines as sold, and
// a shop's own Razorpay keys. Access: drizzle/0017_checkout_access.sql.
// Money is integer paise (ADR-0004); state is derived from timestamps.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, money, tenants } from './schema'



export const orders = pgTable('orders', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  /** The number a customer quotes: per tenant, not global (tenant_counters 'order'). */
  number: integer('number').notNull(),
  /** What the shopper CHOSE: cod | prepaid. The current way it is paid is derived (orders/order-state.ts). */
  paymentMethod: text('payment_method').notNull(),
  // ── Money (paise), set once by checkout/quote.ts at placement. Nothing re-prices an order.
  subtotal: money('subtotal').notNull().default(0),
  shipping: money('shipping').notNull().default(0),
  codCharge: money('cod_charge').notNull().default(0),
  gstTotal: money('gst_total').notNull().default(0),
  total: money('total').notNull().default(0),
  pricesIncludeGst: boolean('prices_include_gst').notNull().default(true),
  /** What the customer pays, excluding GST: what profit.ts reads. Derived, never written. */
  netRevenue: money('net_revenue').generatedAlwaysAs(sql`total - gst_total`),
  /** The lines' taxable value: the base of Frrata's delivered-order fee (not shipping, not the COD fee). */
  merchandiseNet: money('merchandise_net').notNull().default(0),
  /** From the lines' cost snapshot; null when any line's cost is unknown (unknown is not ₹0). */
  cogs: money('cogs'),
  forwardShipping: money('forward_shipping').notNull().default(0),
  /** Razorpay's own fee and its GST on the captured payment (from the payment entity). */
  gatewayFee: money('gateway_fee'),
  gatewayTax: money('gateway_tax'),
  // ── The shopper, for delivery only (DPDP notice at checkout). Erased from abandoned orders after 90 days.
  customerName: text('customer_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  addressLine: text('address_line').notNull().default(''),
  landmark: text('landmark').notNull().default(''),
  pincode: text('pincode').notNull().default(''),
  city: text('city').notNull().default(''),
  state: text('state').notNull().default(''),
  /** GST place of supply (delivery state) and the shop's state (from its GSTIN), for invoices (1D). */
  supplyState: text('supply_state'),
  shopState: text('shop_state'),
  // ── Promises made at placement, snapshotted.
  arrivesFrom: date('arrives_from'),
  arrivesTo: date('arrives_to'),
  returnDays: integer('return_days'),
  returnKind: text('return_kind'),
  // ── Checkout bookkeeping.
  /** sha256 of the link token; the token itself is HMAC(order id) and never stored. */
  tokenHash: text('token_hash'),
  /** The browser's 128-bit key for one checkout attempt, and the hash of what it sent. */
  idempotencyKey: text('idempotency_key'),
  requestHash: text('request_hash'),
  razorpayOrderId: text('razorpay_order_id'),
  razorpayPaymentId: text('razorpay_payment_id'),
  /** An unpaid online order holds its stock until this moment (owner call 3: 20 minutes). */
  payBy: timestamp('pay_by', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentFailedAt: timestamp('payment_failed_at', { withTimezone: true }),
  switchedToCodAt: timestamp('switched_to_cod_at', { withTimezone: true }),
  /** What the shopper was shown and did (hypotheses in frata-unit-economics): totals shown, first card tapped, attribution. */
  checkout: jsonb('checkout').$type<Record<string, unknown>>(),
  erasedAt: timestamp('erased_at', { withTimezone: true }),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  ndrAt: timestamp('ndr_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  rtoInitiatedAt: timestamp('rto_initiated_at', { withTimezone: true }),
  rtoDeliveredAt: timestamp('rto_delivered_at', { withTimezone: true }),
  // ── The merchant's work (1D). Who did each, and when, is in order_events.
  heldAt: timestamp('held_at', { withTimezone: true }),
  /** Packing issues the invoice number (GST: at removal of goods), so the two are set together. */
  packedAt: timestamp('packed_at', { withTimezone: true }),
  invoiceNumber: text('invoice_number'),
  cancelReason: text('cancel_reason'),
  cancelNote: text('cancel_note'),
  /** The shop's GSTIN when the order was placed (null: not registered then): the invoice reads this, never today's settings. */
  sellerGstin: text('seller_gstin'),
  /** The area/locality as typed, kept apart from address_line from 1D (risk reads the line alone). */
  area: text('area').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [
  unique('orders_tenant_id_key').on(t.tenantId, t.id),
  uniqueIndex('orders_tenant_number').on(t.tenantId, t.number),
  index('orders_tenant_placed').on(t.tenantId, t.placedAt),
  // Every lookup leads with the tenant: a unique on the value alone would tell another shop that a value exists.
  uniqueIndex('orders_tenant_token').on(t.tenantId, t.tokenHash),
  uniqueIndex('orders_tenant_idempotency').on(t.tenantId, t.idempotencyKey),
  uniqueIndex('orders_tenant_razorpay').on(t.tenantId, t.razorpayOrderId),
  index('orders_tenant_phone').on(t.tenantId, t.phone),
  // The holds that count against stock: online, unpaid, not cancelled.
  index('orders_tenant_holds').on(t.tenantId, t.payBy).where(sql`${t.paidAt} is null and ${t.cancelledAt} is null and ${t.payBy} is not null`),
  check('orders_payment_method', sql`${t.paymentMethod} in ('cod','prepaid')`),
  check('orders_money', sql`${t.subtotal} >= 0 and ${t.shipping} >= 0 and ${t.codCharge} >= 0 and ${t.gstTotal} >= 0 and ${t.total} >= 0`),
  // The total is its parts (GST inside the prices when they include it).
  check('orders_total', sql`${t.total} = ${t.subtotal} + ${t.shipping} + ${t.codCharge} + case when ${t.pricesIncludeGst} then 0 else ${t.gstTotal} end`),
  check('orders_phone', sql`${t.phone} = '' or ${t.phone} ~ '^[6-9][0-9]{9}$'`),
  check('orders_pincode', sql`${t.pincode} = '' or ${t.pincode} ~ '^[1-9][0-9]{5}$'`),
  uniqueIndex('orders_tenant_invoice').on(t.tenantId, t.invoiceNumber),
  check('orders_invoice_when_packed', sql`(${t.invoiceNumber} is null) = (${t.packedAt} is null)`),
  check('orders_invoice_length', sql`${t.invoiceNumber} is null or length(${t.invoiceNumber}) <= 16`),
  check('orders_cancel_reason', sql`${t.cancelReason} is null or (${t.cancelledAt} is not null and ${t.cancelReason} in ('fake','customer_cancelled','unreachable','out_of_stock','cant_deliver','other'))`),
])

/** One line of an order, as sold: a snapshot, so a later edit to the product never changes an order. */
export const orderLines = pgTable('order_lines', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull(),
  /** Null once the variant is deleted; the snapshot below still says what was sold. */
  variantId: uuid('variant_id'),
  productId: uuid('product_id'),
  title: text('title').notNull(),
  optionValues: text('option_values').array().notNull().default(sql`'{}'::text[]`),
  sku: text('sku'),
  imageBase: text('image_base'),
  imageWidths: integer('image_widths').array(),
  qty: integer('qty').notNull(),
  unitPrice: money('unit_price').notNull(),
  compareAt: money('compare_at'),
  lineDiscount: money('line_discount').notNull().default(0),
  /** Value before GST, after any discount; GST per line, rounded per line (the invoice matches). */
  taxableValue: money('taxable_value').notNull(),
  gstBps: integer('gst_bps').notNull().default(0),
  gst: money('gst').notNull().default(0),
  hsn: text('hsn'),
  /** The merchant's cost of one piece, when known. Server only: never selected by a shopper's route (ADR-0003). */
  unitCost: money('unit_cost'),
  /** How it was sold: in_stock (stock taken), preorder (ships by), made_to_order (lead days). */
  kind: text('kind').notNull().default('in_stock'),
  shipsBy: date('ships_by'),
  leadMinDays: integer('lead_min_days'),
  leadMaxDays: integer('lead_max_days'),
  position: integer('position').notNull().default(0),
  /** When this line's stock left the shelf (in_stock: placement/switch/capture; preorder: packing); null = not taken. */
  stockTakenAt: timestamp('stock_taken_at', { withTimezone: true }),
  /** This line's share of delivery + COD fee, taxed at its rate (composite supply). Null for orders placed before 1D. */
  chargeTaxable: money('charge_taxable'),
  chargeGst: money('charge_gst'),
}, (t) => [
  foreignKey({ name: 'order_lines_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  index('order_lines_order').on(t.tenantId, t.orderId),
  index('order_lines_variant').on(t.tenantId, t.variantId),
  check('order_lines_qty', sql`${t.qty} between 1 and 10`),
  check('order_lines_money', sql`${t.unitPrice} >= 0 and ${t.taxableValue} >= 0 and ${t.gst} >= 0 and ${t.lineDiscount} >= 0 and (${t.unitCost} is null or ${t.unitCost} >= 0)`),
  check('order_lines_kind', sql`${t.kind} in ('in_stock','preorder','made_to_order')`),
])

/** A shop's own Razorpay account (1C): keys encrypted (src/lib/payments/keys.ts), never sent to a browser. */
export const paymentKeys = pgTable('payment_keys', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  keyId: text('key_id').notNull(),
  keySecretEnc: text('key_secret_enc').notNull(),
  webhookSecretEnc: text('webhook_secret_enc').notNull(),
  /** Random, in the webhook URL: how a webhook finds its shop (app_payment_webhook_for). */
  webhookKey: text('webhook_key').notNull(),
  mode: text('mode').notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  /** The first and the latest event Razorpay sent: "a way to pay works" needs the first. */
  webhookSeenAt: timestamp('webhook_seen_at', { withTimezone: true }),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  /** Why online payment is not working, in the merchant's words; null when it is. */
  problem: text('problem'),
}, (t) => [
  uniqueIndex('payment_keys_webhook_key').on(t.webhookKey),
  check('payment_keys_mode', sql`${t.mode} in ('test','live')`),
  check('payment_keys_key_id', sql`${t.keyId} ~ '^rzp_(test|live)_[A-Za-z0-9]{6,40}$'`),
])


/**
 * What people did to an order (1D): append-only. Timestamps on the order say
 * where it is; these say who did what, and survive an undo. FIELD NAMES ONLY —
 * never an address, a phone or a note's text, so nothing here outlives an
 * erasure. The actor's email is a snapshot from sign-in (as support_sessions).
 */
export const orderEvents = pgTable('order_events', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull(),
  kind: text('kind').notNull(),
  actorKind: text('actor_kind').notNull(),
  actorUserId: uuid('actor_user_id'),
  actorEmail: text('actor_email'),
  /** edited: the names of the fields changed. */
  fields: text('fields').array(),
  /** cancelled: the reason code; undone: the kind undone. */
  reason: text('reason'),
  /** undone: the event this reverses. */
  undoes: uuid('undoes'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'order_events_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  unique('order_events_tenant_id_key').on(t.tenantId, t.id),
  // An undo points at an event on the same order (FK in drizzle/0020).
  unique('order_events_order_id_key').on(t.tenantId, t.orderId, t.id),
  index('order_events_order').on(t.tenantId, t.orderId, t.at),
  check('order_events_kind', sql`${t.kind} in ('confirmed','held','unheld','undone','edited','packed','cancelled','note_added','printed_slip','printed_invoice')`),
  check('order_events_actor', sql`${t.actorKind} in ('member','support','system')`),
  // A person is named exactly when one acted.
  check('order_events_who', sql`(${t.actorKind} = 'system') = (${t.actorUserId} is null) and (${t.actorUserId} is null) = (${t.actorEmail} is null)`),
])

/** The team's notes on an order (1D): never shown to the shopper, append-only. */
export const orderNotes = pgTable('order_notes', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull(),
  body: text('body').notNull(),
  authorUserId: uuid('author_user_id').notNull(),
  authorEmail: text('author_email').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'order_notes_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  index('order_notes_order').on(t.tenantId, t.orderId, t.at),
  check('order_notes_body', sql`length(${t.body}) between 1 and 2000`),
])
