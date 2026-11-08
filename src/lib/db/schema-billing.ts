// =============================================================================
// FILE: src/lib/db/schema-billing.ts — WHAT FRRATA BILLS EACH SHOP (billing B0; spec docs/specs/2026-11-08-billing.md,
// plan docs/plans/2026-11-08-billing.md § Review findings, which are binding; access: drizzle/0048_billing_access.sql).
//
// One invoice a month per shop, drafted by the billing run as frata_app inside the shop (withTenant) and issued later
// by an Admin definer (B2), which numbers it from platform_counters. Every order billed has ONE fee row (order_id
// unique) and every order credited ONE credit row (order_id unique): a run bills billable orders with no fee row and
// credits fee rows whose order is no longer billable, so it is idempotent by construction. State is derived from
// timestamps (issued_at); once issued, triggers refuse any change to the invoice or its lines, fees and credits.
// Money is integer paise. The word "bill" is the shop's own bill of supply, so these tables say "frrata_invoice".
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { LINE_KINDS } from '@/domains/billing/bill'
import { sqlList } from '@/domains/tenancy/roles'
import { at, createdAt, id, money, tenants } from './schema'
import { orders } from './schema-orders'

/** A shop's billing details (B1 form) and, from B3, its mandate. frata_app sees and edits the detail columns only. */
export const billingAccounts = pgTable('billing_accounts', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'restrict' }),
  legalName: text('legal_name').notNull().default(''),
  gstin: text('gstin'),
  address: text('address').notNull().default(''),
  /** GST state code ('08'), from the GSTIN when there is one; the place of supply. */
  stateCode: text('state_code'),
  email: text('email').notNull().default(''),
  // B3, written only through definers; no frata_app grant on these.
  gatewayCustomerId: text('gateway_customer_id'),
  mandateTokenId: text('mandate_token_id'),
  mandateMethod: text('mandate_method'),
  mandateMax: money('mandate_max'),
  mandateAt: at('mandate_at'),
  mandateRevokedAt: at('mandate_revoked_at'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  check('billing_accounts_gstin', sql`${t.gstin} is null or ${t.gstin} ~ '^[0-9]{2}[A-Z0-9]{13}$'`),
  check('billing_accounts_state', sql`${t.stateCode} is null or ${t.stateCode} ~ '^[0-9]{2}$'`),
  check('billing_accounts_sizes', sql`length(${t.legalName}) <= 200 and length(${t.address}) <= 400 and length(${t.email}) <= 254`),
])

/**
 * One invoice per shop per month (period_start = the 1st, 00:00 IST). A draft until issued_at; the number, issue time
 * and buyer details are set only by the issue definer (B2). Totals are computeBill's, frozen at issue.
 */
export const frrataInvoices = pgTable('frrata_invoices', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  periodStart: at('period_start').notNull(),
  periodEnd: at('period_end').notNull(),
  draftedAt: at('drafted_at').notNull().defaultNow(),
  taxable: money('taxable').notNull(),
  cgst: money('cgst').notNull(),
  sgst: money('sgst').notNull(),
  igst: money('igst').notNull(),
  total: money('total').notNull(),
  carryIn: money('carry_in').notNull().default(0),
  /** Taxable value carried to the next month: a rolled bill's (positive) or a negative balance. */
  carryOut: money('carry_out').notNull().default(0),
  rolled: boolean('rolled').notNull().default(false),
  ordersBilled: integer('orders_billed').notNull().default(0),
  includedOrders: integer('included_orders').notNull().default(0),
  // Set at issue only (B2).
  number: text('number'),
  issuedAt: at('issued_at'),
  issuedBy: uuid('issued_by'),
  buyerName: text('buyer_name'),
  buyerGstin: text('buyer_gstin'),
  buyerAddress: text('buyer_address'),
  placeOfSupply: text('place_of_supply'),
  /** Frrata as the supplier, frozen at issue (B2): its legal name, GSTIN, address and the SAC of the service. */
  sellerName: text('seller_name'),
  sellerGstin: text('seller_gstin'),
  sellerAddress: text('seller_address'),
  sac: text('sac'),
  /** Issued in test mode (no GSTIN yet): its own TEST series, printed "not a tax invoice", never collected for real. */
  testMode: boolean('test_mode').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('frrata_invoices_tenant_period').on(t.tenantId, t.periodStart),
  unique('frrata_invoices_tenant_id_key').on(t.tenantId, t.id),
  uniqueIndex('frrata_invoices_number').on(t.number),
  index('frrata_invoices_period').on(t.periodStart),
  check('frrata_invoices_issued', sql`${t.number} is null or ${t.issuedAt} is not null`),
  check('frrata_invoices_money', sql`${t.taxable} >= 0 and ${t.cgst} >= 0 and ${t.sgst} >= 0 and ${t.igst} >= 0 and (${t.total} = ${t.taxable} + ${t.cgst} + ${t.sgst} + ${t.igst} or ${t.rolled})`),
  check('frrata_invoices_period_order', sql`${t.periodEnd} > ${t.periodStart}`),
])

/** An invoice's lines, in order. Replaced while a draft; frozen with it. */
export const frrataInvoiceLines = pgTable('frrata_invoice_lines', {
  id: id(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  position: integer('position').notNull(),
  kind: text('kind').notNull(),
  description: text('description').notNull(),
  periodStart: at('period_start').notNull(),
  periodEnd: at('period_end').notNull(),
  quantity: integer('quantity').notNull(),
  rateBps: integer('rate_bps'),
  taxable: money('taxable').notNull(),
}, (t) => [
  foreignKey({ name: 'frrata_invoice_lines_invoice_fk', columns: [t.tenantId, t.invoiceId], foreignColumns: [frrataInvoices.tenantId, frrataInvoices.id] }).onDelete('cascade'),
  uniqueIndex('frrata_invoice_lines_position').on(t.invoiceId, t.position),
  check('frrata_invoice_lines_kind', sql`${t.kind} in (${sql.raw(sqlList(LINE_KINDS))})`),
])

/** THE record that an order was billed: one row per order, ever (order_id unique). */
export const frrataInvoiceFees = pgTable('frrata_invoice_fees', {
  tenantId: uuid('tenant_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  orderId: uuid('order_id').notNull(),
  billableAt: at('billable_at').notNull(),
  base: money('base').notNull(),
  feeBps: integer('fee_bps').notNull(),
  fee: money('fee').notNull(),
}, (t) => [
  primaryKey({ name: 'frrata_invoice_fees_order', columns: [t.orderId] }),
  foreignKey({ name: 'frrata_invoice_fees_invoice_fk', columns: [t.tenantId, t.invoiceId], foreignColumns: [frrataInvoices.tenantId, frrataInvoices.id] }).onDelete('cascade'),
  foreignKey({ name: 'frrata_invoice_fees_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('restrict'),
  index('frrata_invoice_fees_invoice').on(t.tenantId, t.invoiceId),
  // The credits' key: a credit names its fee within its own shop (tenancy audit 2026-11-08).
  unique('frrata_invoice_fees_tenant_order_key').on(t.tenantId, t.orderId),
  check('frrata_invoice_fees_money', sql`${t.base} >= 0 and ${t.fee} >= 0 and ${t.feeBps} between 0 and 10000`),
])

/** THE record that a billed order's fee was reversed (it came back or was lost later): one per order, ever. */
export const frrataFeeCredits = pgTable('frrata_fee_credits', {
  tenantId: uuid('tenant_id').notNull(),
  /** The invoice the credit is applied on (the next month's). */
  invoiceId: uuid('invoice_id').notNull(),
  orderId: uuid('order_id').notNull(),
  fee: money('fee').notNull(),
}, (t) => [
  primaryKey({ name: 'frrata_fee_credits_order', columns: [t.orderId] }),
  foreignKey({ name: 'frrata_fee_credits_invoice_fk', columns: [t.tenantId, t.invoiceId], foreignColumns: [frrataInvoices.tenantId, frrataInvoices.id] }).onDelete('cascade'),
  // Only an order that was billed can be credited.
  foreignKey({ name: 'frrata_fee_credits_fee_fk', columns: [t.tenantId, t.orderId], foreignColumns: [frrataInvoiceFees.tenantId, frrataInvoiceFees.orderId] }).onDelete('restrict'),
  index('frrata_fee_credits_invoice').on(t.tenantId, t.invoiceId),
  check('frrata_fee_credits_money', sql`${t.fee} >= 0`),
])

/** Frrata's own document series (its invoices, from B2), per financial year. Written only by the issue definer. */
export const platformCounters = pgTable('platform_counters', {
  kind: text('kind').notNull(),
  fy: text('fy').notNull(),
  next: integer('next').notNull().default(1),
}, (t) => [
  primaryKey({ columns: [t.kind, t.fy] }),
  check('platform_counters_kind', sql`${t.kind} in ('invoice', 'credit')`),
  check('platform_counters_next', sql`${t.next} >= 1`),
])

/**
 * Money received against an issued Frrata invoice (billing B2 by hand, B3 by the gateway): one row per attempt or
 * transfer. Captured or failed is derived from timestamps; "paid" is derived (captured + credited ≥ total). Written only
 * by definers: Admin recording a bank transfer (unique UTR), the gateway's events (unique ids).
 */
export const frrataPayments = pgTable('frrata_payments', {
  id: id(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  attempt: integer('attempt').notNull().default(0),
  method: text('method').notNull(),
  amount: money('amount').notNull(),
  utr: text('utr'),
  gatewayOrderId: text('gateway_order_id'),
  gatewayPaymentId: text('gateway_payment_id'),
  capturedAt: at('captured_at'),
  failedAt: at('failed_at'),
  failureReason: text('failure_reason'),
  recordedBy: uuid('recorded_by'),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: 'frrata_payments_invoice_fk', columns: [t.tenantId, t.invoiceId], foreignColumns: [frrataInvoices.tenantId, frrataInvoices.id] }).onDelete('restrict'),
  index('frrata_payments_invoice').on(t.tenantId, t.invoiceId),
  uniqueIndex('frrata_payments_utr').on(t.utr),
  uniqueIndex('frrata_payments_gateway_order').on(t.gatewayOrderId),
  uniqueIndex('frrata_payments_gateway_payment').on(t.gatewayPaymentId),
  check('frrata_payments_method', sql`${t.method} in ('bank_transfer','upi','card','emandate','paylink')`),
  check('frrata_payments_amount', sql`${t.amount} > 0`),
  check('frrata_payments_outcome', sql`not (${t.capturedAt} is not null and ${t.failedAt} is not null)`),
])

/** Frrata's credit note to a shop (B2): a waiver or correction against an issued invoice, its own series; final. */
export const frrataCreditNotes = pgTable('frrata_credit_notes', {
  id: id(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  number: text('number').notNull(),
  taxable: money('taxable').notNull(),
  cgst: money('cgst').notNull(),
  sgst: money('sgst').notNull(),
  igst: money('igst').notNull(),
  total: money('total').notNull(),
  reason: text('reason').notNull(),
  testMode: boolean('test_mode').notNull().default(false),
  issuedAt: at('issued_at').notNull().defaultNow(),
  issuedBy: uuid('issued_by').notNull(),
}, (t) => [
  foreignKey({ name: 'frrata_credit_notes_invoice_fk', columns: [t.tenantId, t.invoiceId], foreignColumns: [frrataInvoices.tenantId, frrataInvoices.id] }).onDelete('restrict'),
  uniqueIndex('frrata_credit_notes_number').on(t.number),
  index('frrata_credit_notes_invoice').on(t.tenantId, t.invoiceId),
  check('frrata_credit_notes_money', sql`${t.taxable} > 0 and ${t.total} = ${t.taxable} + ${t.cgst} + ${t.sgst} + ${t.igst}`),
  check('frrata_credit_notes_reason', sql`length(${t.reason}) between 3 and 240`),
])
