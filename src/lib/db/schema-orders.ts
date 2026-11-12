// =============================================================================
// FILE: src/lib/db/schema-orders.ts
//
// ORDERS (1C): the order with its money and promises, its lines as sold, and
// a shop's own Razorpay keys. Access: drizzle/0017_checkout_access.sql.
// Money is integer paise (ADR-0004); state is derived from timestamps.
// =============================================================================

import { EMAIL_SQL } from '@/domains/email/shape'
import { sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, money, tenants } from './schema'



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
  /** The offers' merchandise discount: Σ order_lines.line_discount, kept here as a snapshot (verify check; plan review). */
  discount: money('discount').notNull().default(0),
  /** The lines' taxable value after offers: the base of Frrata's delivered-order fee (not shipping, not the COD fee). */
  merchandiseNet: money('merchandise_net').notNull().default(0),
  /** From the lines' cost snapshot; null when any line's cost is unknown (unknown is not ₹0). */
  cogs: money('cogs'),
  /**
   * What shipping actually cost (Ship S·3, from the courier's statement): null until known, then `freight.ts` uses the
   * shop's confirmed estimate instead. Never the quote. `courierCodFee` is the courier's fee, net of a reversal on a
   * return; not `codCharge` (what the SHOPPER paid for Pay on delivery).
   */
  forwardShipping: money('forward_shipping'),
  rtoShipping: money('rto_shipping'),
  courierCodFee: money('courier_cod_fee'),
  /** Razorpay's own fee and its GST on the captured payment (from the payment entity). */
  gatewayFee: money('gateway_fee'),
  gatewayTax: money('gateway_tax'),
  // ── The shopper, for delivery only (DPDP notice at checkout). Erased from abandoned orders after 90 days.
  customerName: text('customer_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  /** For order emails (email plan E·2): lower-cased, shape.ts's rule; editable until erased; erasure nulls it. */
  email: text('email'),
  /** The shopper ticked "order updates and a review request on WhatsApp" (unticked by default: DPDP s.6; owner
   *  2026-11-09). Null = never asked or said no: such an order is never messaged. The notice's version and language. */
  waOptInAt: timestamp('wa_opt_in_at', { withTimezone: true }),
  waOptInNotice: text('wa_opt_in_notice'),
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
  /** The shop's customer, set only when this order's phone is that customer's (EkCode P1; composite FK in 0088). */
  customerId: uuid('customer_id'),
  erasedAt: timestamp('erased_at', { withTimezone: true }),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  ndrAt: timestamp('ndr_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  rtoInitiatedAt: timestamp('rto_initiated_at', { withTimezone: true }),
  rtoDeliveredAt: timestamp('rto_delivered_at', { withTimezone: true }),
  /** The courier lost, destroyed or damaged the parcel (Ship S·0 by hand; S·1 from the courier): never billed as delivered. */
  lostAt: timestamp('lost_at', { withTimezone: true }),
  // ── The merchant's work (1D). Who did each, and when, is in order_events.
  heldAt: timestamp('held_at', { withTimezone: true }),
  /** Packing issues the invoice number (GST: at removal of goods), so the two are set together. */
  packedAt: timestamp('packed_at', { withTimezone: true }),
  invoiceNumber: text('invoice_number'),
  /** The shop's logo as it was at packing (its Blob path, never overwritten): every copy of the invoice shows it (Documents D2). */
  invoiceLogo: text('invoice_logo'),
  /** The signatory and invoice note as they were at packing (Settings › Documents): an issued invoice never changes. */
  invoiceSignatory: text('invoice_signatory'),
  invoiceNote: text('invoice_note'),
  cancelReason: text('cancel_reason'),
  cancelNote: text('cancel_note'),
  /** The shop's GSTIN when the order was placed (null: not registered then): the invoice reads this, never today's settings. */
  sellerGstin: text('seller_gstin'),
  /** The seller's GST scheme when placed (regular | composition; null: not registered). What decides "charges GST" (tax/gst.ts chargesGst). */
  sellerScheme: text('seller_scheme'),
  /** A business buyer's GSTIN and name, asked at checkout (a B2B invoice); fixed once the invoice is issued. */
  buyerGstin: text('buyer_gstin'),
  buyerName: text('buyer_name').notNull().default(''),
  // The seller as it was at packing (1D·7): an issued invoice never follows a later change to Settings.
  sellerName: text('seller_name'),
  sellerAddress: text('seller_address'),
  /** The area/locality as typed, kept apart from address_line from 1D (risk reads the line alone). */
  area: text('area').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [
  unique('orders_tenant_id_key').on(t.tenantId, t.id),
  check('orders_invoice_logo', sql`${t.invoiceLogo} is null or ${t.invoiceLogo} ~ ('^https://[a-z0-9]+\\.public\\.blob\\.vercel-storage\\.com/tenants/' || ${t.tenantId}::text || '/documents/[0-9a-f-]{36}\\.png$')`),
  uniqueIndex('orders_tenant_number').on(t.tenantId, t.number),
  index('orders_tenant_placed').on(t.tenantId, t.placedAt),
  // Best sellers by delivered units (themes T1·3): the shop's delivered orders in a window.
  index('orders_tenant_delivered').on(t.tenantId, t.deliveredAt).where(sql`${t.deliveredAt} is not null`),
  // The GST month: invoices by their date (packing), for GSTR-1 (plan review 2026-11-09).
  index('orders_tenant_packed').on(t.tenantId, t.packedAt).where(sql`${t.packedAt} is not null`),
  // Every lookup leads with the tenant: a unique on the value alone would tell another shop that a value exists.
  uniqueIndex('orders_tenant_token').on(t.tenantId, t.tokenHash),
  uniqueIndex('orders_tenant_idempotency').on(t.tenantId, t.idempotencyKey),
  uniqueIndex('orders_tenant_razorpay').on(t.tenantId, t.razorpayOrderId),
  index('orders_tenant_phone').on(t.tenantId, t.phone),
  // The holds that count against stock: online, unpaid, not cancelled.
  index('orders_tenant_holds').on(t.tenantId, t.payBy).where(sql`${t.paidAt} is null and ${t.cancelledAt} is null and ${t.payBy} is not null`),
  // The shipping tabs (Ship S·0): packed, no outcome yet. inFlightSql (order-predicates.ts) says this first.
  index('orders_inflight_idx').on(t.tenantId, t.placedAt.desc()).where(sql`${t.rtoDeliveredAt} is null and (${t.rtoInitiatedAt} is not null or (${t.deliveredAt} is null and ${t.lostAt} is null and ${t.cancelledAt} is null and (${t.packedAt} is not null or ${t.shippedAt} is not null or ${t.ndrAt} is not null)))`),
  check('orders_freight', sql`(${t.forwardShipping} is null or ${t.forwardShipping} >= 0) and (${t.rtoShipping} is null or ${t.rtoShipping} >= 0) and (${t.courierCodFee} is null or ${t.courierCodFee} >= 0)`),
  check('orders_payment_method', sql`${t.paymentMethod} in ('cod','prepaid')`),
  check('orders_wa_opt_in', sql`(${t.waOptInAt} is null) = (${t.waOptInNotice} is null)`),
  check('orders_money', sql`${t.subtotal} >= 0 and ${t.shipping} >= 0 and ${t.codCharge} >= 0 and ${t.gstTotal} >= 0 and ${t.total} >= 0`),
  // The total is its parts, less the offers' discount (GST inside the prices when they include it).
  check('orders_total', sql`${t.total} = ${t.subtotal} - ${t.discount} + ${t.shipping} + ${t.codCharge} + case when ${t.pricesIncludeGst} then 0 else ${t.gstTotal} end`),
  check('orders_discount', sql`${t.discount} >= 0 and ${t.discount} <= ${t.subtotal}`),
  check('orders_phone', sql`${t.phone} = '' or ${t.phone} ~ '^[6-9][0-9]{9}$'`),
  check('orders_pincode', sql`${t.pincode} = '' or ${t.pincode} ~ '^[1-9][0-9]{5}$'`),
  uniqueIndex('orders_tenant_invoice').on(t.tenantId, t.invoiceNumber),
  check('orders_invoice_when_packed', sql`(${t.invoiceNumber} is null) = (${t.packedAt} is null)`),
  check('orders_invoice_length', sql`${t.invoiceNumber} is null or length(${t.invoiceNumber}) <= 16`),
  check('orders_seller_scheme', sql`${t.sellerScheme} is null or ${t.sellerScheme} in ('regular','composition')`),
  check('orders_buyer_gstin', sql`${t.buyerGstin} is null or ${t.buyerGstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
  check('orders_buyer_name', sql`length(${t.buyerName}) <= 120`),
  check('orders_email', sql`${t.email} is null or (length(${t.email}) <= 254 and ${t.email} ~ ${sql.raw(`'${EMAIL_SQL.replace(/'/g, "''")}'`)})`),
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
  /** The product offers' part of line_discount, fixed at placement and never re-spread by a reprice (offers O·2). */
  productDiscount: money('product_discount').notNull().default(0),
  /** Value before GST, after any discount; GST per line, rounded per line (the invoice matches). */
  taxableValue: money('taxable_value').notNull(),
  gstBps: integer('gst_bps').notNull().default(0),
  gst: money('gst').notNull().default(0),
  hsn: text('hsn'),
  /** The unit as invoiced (products.uqc when placed). */
  uqc: text('uqc').notNull().default('NOS'),
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
  unique('order_lines_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'order_lines_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  index('order_lines_order').on(t.tenantId, t.orderId),
  index('order_lines_variant').on(t.tenantId, t.variantId),
  check('order_lines_qty', sql`${t.qty} between 1 and 10`),
  check('order_lines_money', sql`${t.unitPrice} >= 0 and ${t.taxableValue} >= 0 and ${t.gst} >= 0 and ${t.lineDiscount} >= 0 and ${t.productDiscount} >= 0 and ${t.productDiscount} <= ${t.lineDiscount} and (${t.unitCost} is null or ${t.unitCost} >= 0)`),
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
  /** cancelled: the reason code; undone: the kind undone; credit_noted: why (cancelled, came_back). */
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
  check('order_events_kind', sql`${t.kind} in ('confirmed','held','unheld','undone','edited','packed','cancelled','note_added','printed_slip','printed_invoice','shipped','delivered','rto','lost','ndr','shipment_cancelled','credit_noted')`),
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

/**
 * A parcel on its way (Ship, docs/specs/2026-11-08-ship.md): who carries it and how to follow it. At most one OPEN
 * shipment per order. The ORDER's state stays derived from its own timestamps (order-state.ts); this holds only what
 * the courier knows, and the shipment's OWN ending (never a copy of delivered, returned or lost): cancelled before
 * pickup, or undone (Shipped was undone, so the order can ship again). `self`: shipped another way
 * (courier name and tracking number as typed; never unique). Access: drizzle/0046_ship_access.sql.
 */
export const shipments = pgTable('shipments', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull(),
  provider: text('provider').notNull(),
  courierName: text('courier_name'),
  trackingNumber: text('tracking_number'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endedReason: text('ended_reason'),
}, (t) => [
  foreignKey({ name: 'shipments_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  unique('shipments_tenant_id_key').on(t.tenantId, t.id),
  uniqueIndex('shipments_one_open').on(t.tenantId, t.orderId).where(sql`${t.endedAt} is null`),
  index('shipments_order').on(t.tenantId, t.orderId),
  check('shipments_provider', sql`${t.provider} in ('self','shiprocket')`),
  check('shipments_text', sql`(${t.courierName} is null or length(${t.courierName}) between 1 and 60) and (${t.trackingNumber} is null or length(${t.trackingNumber}) between 1 and 40)`),
  check('shipments_ended', sql`(${t.endedAt} is null) = (${t.endedReason} is null) and (${t.endedReason} is null or ${t.endedReason} in ('cancelled','undone'))`),
])

/**
 * A credit note (Documents D3): an issued invoice reversed in full when the sale was undone after packing (cancelled,
 * or the parcel came back). One per order; its own series per financial year (tenant_counters kind 'credit'). Final
 * once written: frata_app may only insert (and a trigger refuses any change, drizzle/0053). Its document is rendered
 * from the order's frozen rows (creditNote(), src/domains/orders/documents.ts); the totals here are the figures it was
 * issued with, so a later reader never recomputes them.
 */
export const creditNotes = pgTable('credit_notes', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull(),
  number: text('number').notNull(),
  againstInvoice: text('against_invoice').notNull(),
  reason: text('reason').notNull(),
  taxable: money('taxable').notNull(),
  cgst: money('cgst').notNull(),
  sgst: money('sgst').notNull(),
  igst: money('igst').notNull(),
  total: money('total').notNull(),
  issuedAt: at('issued_at').notNull().defaultNow(),
  issuedBy: uuid('issued_by').notNull(),
  /**
   * GST plan phase 2: `reversal` the whole invoice (or what is left of it) when the sale is undone; `return` lines or
   * part quantities brought back after delivery; `discount` a discount agreed before the sale, given afterwards
   * (s.15(3)(b)); `goodwill` money back with no GST effect (its own series, never in GSTR-1). Lines in credit_note_lines
   * (a reversal issued before 0071 has none: it reversed the whole invoice).
   */
  kind: text('kind').notNull().default('reversal'),
}, (t) => [
  foreignKey({ name: 'credit_notes_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('restrict'),
  unique('credit_notes_tenant_id_key').on(t.tenantId, t.id),
  index('credit_notes_order').on(t.tenantId, t.orderId),
  index('credit_notes_issued').on(t.tenantId, t.issuedAt),
  uniqueIndex('credit_notes_number').on(t.tenantId, t.number),
  check('credit_notes_reason', sql`${t.reason} in ('cancelled','came_back','returned','discount','goodwill')`),
  check('credit_notes_kind', sql`${t.kind} in ('reversal','return','discount','goodwill') and (${t.kind} <> 'goodwill' or (${t.cgst} = 0 and ${t.sgst} = 0 and ${t.igst} = 0))`),
  check('credit_notes_number_len', sql`length(${t.number}) <= 16`),
  check('credit_notes_money', sql`${t.taxable} >= 0 and ${t.cgst} >= 0 and ${t.sgst} >= 0 and ${t.igst} >= 0 and ${t.total} = ${t.taxable} + ${t.cgst} + ${t.sgst} + ${t.igst}`),
])

/**
 * What a credit note credits, line by line (GST plan phase 2): the order line, the quantity, and the taxable value and
 * GST at the INVOICE's own rate (a credit note keeps its invoice's rate and HSN). Final once written, as its note.
 */
export const creditNoteLines = pgTable('credit_note_lines', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  creditNoteId: uuid('credit_note_id').notNull(),
  orderLineId: uuid('order_line_id').notNull(),
  qty: integer('qty').notNull(),
  taxable: money('taxable').notNull(),
  gst: money('gst').notNull(),
  gstBps: integer('gst_bps').notNull(),
  /**
   * Pieces of this line put back in stock when the note was issued (a return after delivery, "Put these pieces back in
   * stock"): written once with the line, never after (final). Their cost comes back off the order's COGS in ₹ kept
   * (`restockedCostSql`). 0 for a discount, goodwill, a reversal, or a return not restocked.
   */
  restockedQty: integer('restocked_qty').notNull().default(0),
}, (t) => [
  foreignKey({ name: 'credit_note_lines_note_fk', columns: [t.tenantId, t.creditNoteId], foreignColumns: [creditNotes.tenantId, creditNotes.id] }).onDelete('restrict'),
  foreignKey({ name: 'credit_note_lines_line_fk', columns: [t.tenantId, t.orderLineId], foreignColumns: [orderLines.tenantId, orderLines.id] }).onDelete('restrict'),
  index('credit_note_lines_note').on(t.tenantId, t.creditNoteId),
  index('credit_note_lines_line').on(t.tenantId, t.orderLineId),
  check('credit_note_lines_money', sql`${t.qty} >= 0 and ${t.taxable} >= 0 and ${t.gst} >= 0 and ${t.gstBps} >= 0`),
  check('credit_note_lines_restocked', sql`${t.restockedQty} >= 0 and ${t.restockedQty} <= ${t.qty}`),
])
