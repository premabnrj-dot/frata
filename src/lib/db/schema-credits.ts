// =============================================================================
// FILE: src/lib/db/schema-credits.ts — STUDIO CREDITS AND BILLING FOR PARTNERS (C1·2; plan docs/plans/2026-11-22-c1-credits.md
// § Data, with the five reviews of 2026-11-22; access: the custom migration after these tables, proof tenancy.sql § 89).
//
// Platform scope, no tenant: every table here reaches NO Frrata role (frata_app, frata_admin, frata_builder hold no
// grant; RLS on; a restrictive definer_only policy; check:tenant names them). The definers are the only door: a person's
// take the partner from the caller's live membership and re-check the passkey; a system one takes ids only.
// Rows that point at each other carry the partner in their foreign key (tenancy H2), so a draw can never name another
// partner's lot. Money is integer paise; credits are integers; a state is a timestamp, never a status column.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, integer, pgTable, primaryKey, smallint, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sqlList } from '@/domains/tenancy/roles'
import { BOUGHT_LOTS, DRAW_KINDS, ENTRY_KINDS, LOT_KINDS, NOTICE_KINDS, PURCHASE_KINDS, RATE_SOURCES, RETURN_REASONS, SEAT_METHODS, TRY_KINDS, USE_KINDS, USE_WHAT } from '@/domains/studio/ledger'
import { SEAT_PLAN_KEYS } from '@/domains/studio/prices'
import { LIMITS, MAX_BUDGET } from '@/domains/studio/credits'
import { at, createdAt, id, money } from './schema'
import { partnerLinks, partnerMembers, partners } from './schema-partners'

const list = (xs: readonly string[]) => sql.raw(sqlList(xs))

/** Who the partner's invoices go to, its alerts and its AutoPay (owner only; one row a partner, made at approval). */
export const partnerBilling = pgTable('partner_billing', {
  partnerId: uuid('partner_id').primaryKey().references(() => partners.id, { onDelete: 'restrict' }),
  legalName: text('legal_name'),
  gstin: text('gstin'),
  /** The PAN inside the GSTIN (characters 3–12): the free credits are once per PAN (owner 2026-11-22). */
  pan: text('pan'),
  stateCode: text('state_code'),
  address: text('address'),
  invoiceEmail: text('invoice_email'),
  detailsAt: at('details_at'),
  alertLow: boolean('alert_low').notNull().default(true),
  alertBudget: boolean('alert_budget').notNull().default(true),
  newSiteBudget: integer('new_site_budget').notNull().default(300),
  /** Set when the balance fell below the email line; cleared once it is back above (one email a crossing). */
  lowAlertedAt: at('low_alerted_at'),
  customerId: text('customer_id'),
  tokenId: text('token_id'),
  mandateMethod: text('mandate_method'),
  mandateMax: money('mandate_max'),
  mandateAt: at('mandate_at'),
  mandateRevokedAt: at('mandate_revoked_at'),
  // A mandate no longer used is cancelled through partner_mandate_cancels (C1·B: a queue, never one overwritten slot).
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('partner_billing_token').on(t.tokenId).where(sql`${t.tokenId} is not null`),
  index('partner_billing_pan').on(t.pan).where(sql`${t.pan} is not null`),
  check('partner_billing_name', sql`${t.legalName} is null or length(${t.legalName}) between 1 and 120`),
  check('partner_billing_gstin', sql`${t.gstin} is null or ${t.gstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
  check('partner_billing_pan_shape', sql`${t.pan} is null or ${t.pan} ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'`),
  check('partner_billing_state', sql`${t.stateCode} is null or ${t.stateCode} ~ '^[0-9]{2}$'`),
  check('partner_billing_address', sql`${t.address} is null or length(${t.address}) between 1 and 300`),
  check('partner_billing_email', sql`${t.invoiceEmail} is null or (length(${t.invoiceEmail}) <= 254 and ${t.invoiceEmail} ~ '^[^@\\s]+@[^@\\s]+$')`),
  check('partner_billing_site_budget', sql`${t.newSiteBudget} between 1 and ${sql.raw(String(MAX_BUDGET))}`),
  check('partner_billing_method', sql`${t.mandateMethod} is null or ${t.mandateMethod} in (${list(SEAT_METHODS)})`),
  check('partner_billing_mandate', sql`(${t.tokenId} is null) = (${t.mandateMethod} is null)`),
])

/** A seat: Studio or Studio Plus, month to month on AutoPay. Where it stands is `seatState` over these timestamps. */
export const partnerSeats = pgTable('partner_seats', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  plan: text('plan').notNull(),
  /** A change waits for the renewal (owner 2026-11-22, d). */
  nextPlan: text('next_plan'),
  method: text('method').notNull(),
  test: boolean('test').notNull(),
  startedAt: at('started_at').notNull(),
  periodEnd: at('period_end').notNull(),
  cancelAt: at('cancel_at'),
  failedAt: at('failed_at'),
  endedAt: at('ended_at'),
  createdAt: createdAt(),
}, (t) => [
  unique('partner_seats_partner_id_key').on(t.partnerId, t.id),
  uniqueIndex('partner_seats_one_live').on(t.partnerId).where(sql`${t.endedAt} is null`),
  index('partner_seats_due').on(t.periodEnd).where(sql`${t.endedAt} is null`),
  check('partner_seats_plan', sql`${t.plan} in (${list(SEAT_PLAN_KEYS)}) and (${t.nextPlan} is null or ${t.nextPlan} in (${list(SEAT_PLAN_KEYS)}))`),
  check('partner_seats_method', sql`${t.method} in (${list(SEAT_METHODS)})`),
])

/**
 * An attempt to take a partner's money, committed before Razorpay hears of it (ADR-0008; no outbox: no tenant). The
 * receipt is ours; the order and payment ids are written once from OUR server's calls and fetches, never the browser's.
 * The buyer, seller and taxes are frozen here at the moment of buying (an invoice reads this row, never today's details).
 */
export const partnerCreditPurchases = pgTable('partner_credit_purchases', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  credits: integer('credits').notNull(),
  plan: text('plan'),
  seatId: uuid('seat_id'),
  /** A renewal: the end of the period it pays for (its attempts are counted per period). */
  forPeriodEnd: at('for_period_end'),
  attempt: smallint('attempt').notNull().default(1),
  method: text('method'),
  mandateMax: money('mandate_max'),
  taxable: money('taxable').notNull(),
  cgst: money('cgst').notNull(),
  sgst: money('sgst').notNull(),
  igst: money('igst').notNull(),
  total: money('total').notNull(),
  /** Paid with test keys (moves no money); `invoiceTest` = seller.test || test (security M2). */
  test: boolean('test').notNull(),
  invoiceTest: boolean('invoice_test').notNull(),
  buyerName: text('buyer_name').notNull(),
  buyerGstin: text('buyer_gstin'),
  buyerState: text('buyer_state').notNull(),
  buyerAddress: text('buyer_address').notNull(),
  sellerName: text('seller_name').notNull(),
  sellerGstin: text('seller_gstin'),
  sellerAddress: text('seller_address').notNull(),
  sac: text('sac').notNull(),
  prefix: text('prefix').notNull(),
  fy: text('fy').notNull(),
  receipt: text('receipt').notNull(),
  gatewayOrderId: text('gateway_order_id'),
  paymentId: text('payment_id'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  claimedAt: at('claimed_at'),
  noticeQueuedAt: at('notice_queued_at'),
  noticeSentAt: at('notice_sent_at'),
  debitAfter: at('debit_after'),
  paidAt: at('paid_at'),
  failedAt: at('failed_at'),
  failedReason: text('failed_reason'),
  closedAt: at('closed_at'),
  closedReason: text('closed_reason'),
  /** Money the gateway captured that bought nothing (amount, mode, a closed attempt, a second capture): refunded by
   *  the hourly run, the attempt marked before the request (architecture M7). */
  refundDueAt: at('refund_due_at'),
  refundPaymentId: text('refund_payment_id'),
  refundAmount: money('refund_amount'),
  refundClaimedAt: at('refund_claimed_at'),
  refundedAt: at('refunded_at'),
  refundGatewayId: text('refund_gateway_id'),
  disputedAt: at('disputed_at'),
}, (t) => [
  unique('partner_credit_purchases_partner_id_key').on(t.partnerId, t.id),
  uniqueIndex('partner_credit_purchases_receipt').on(t.receipt),
  uniqueIndex('partner_credit_purchases_order').on(t.gatewayOrderId).where(sql`${t.gatewayOrderId} is not null`),
  uniqueIndex('partner_credit_purchases_payment').on(t.paymentId).where(sql`${t.paymentId} is not null`),
  uniqueIndex('partner_credit_purchases_one_open_seat').on(t.seatId)
    .where(sql`${t.seatId} is not null and ${t.paidAt} is null and ${t.failedAt} is null and ${t.closedAt} is null`),
  index('partner_credit_purchases_partner').on(t.partnerId, t.createdAt),
  index('partner_credit_purchases_open').on(t.createdAt).where(sql`${t.paidAt} is null and ${t.failedAt} is null and ${t.closedAt} is null`),
  index('partner_credit_purchases_refund').on(t.refundDueAt).where(sql`${t.refundDueAt} is not null and ${t.refundedAt} is null`),
  foreignKey({ name: 'partner_credit_purchases_seat_fk', columns: [t.partnerId, t.seatId], foreignColumns: [partnerSeats.partnerId, partnerSeats.id] }).onDelete('restrict'),
  check('partner_credit_purchases_kind', sql`${t.kind} in (${list(PURCHASE_KINDS)})`),
  check('partner_credit_purchases_seat', sql`(${t.kind} in ('seat_start','seat_renewal')) = (${t.plan} is not null and ${t.method} is not null and ${t.mandateMax} is not null)`),
  check('partner_credit_purchases_renewal', sql`(${t.kind} = 'seat_renewal') = (${t.seatId} is not null and ${t.forPeriodEnd} is not null)`),
  check('partner_credit_purchases_credits', sql`${t.credits} between 1 and 4000`),
  check('partner_credit_purchases_money', sql`${t.taxable} > 0 and ${t.cgst} >= 0 and ${t.sgst} >= 0 and ${t.igst} >= 0 and ${t.total} = ${t.taxable} + ${t.cgst} + ${t.sgst} + ${t.igst}`),
  check('partner_credit_purchases_once', sql`num_nonnulls(${t.paidAt}, ${t.failedAt}, ${t.closedAt}) <= 1`),
  check('partner_credit_purchases_reason', sql`(${t.failedReason} is null or length(${t.failedReason}) <= 160) and (${t.closedReason} is null or length(${t.closedReason}) <= 80)`),
])

/** A Frrata tax invoice to a partner, issued once when its purchase is paid; numbered on the shared FRR series. */
export const partnerInvoices = pgTable('partner_invoices', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  purchaseId: uuid('purchase_id').notNull(),
  number: text('number').notNull(),
  test: boolean('test').notNull(),
  issuedAt: at('issued_at').notNull().defaultNow(),
  buyerName: text('buyer_name').notNull(),
  buyerGstin: text('buyer_gstin'),
  buyerState: text('buyer_state').notNull(),
  buyerAddress: text('buyer_address').notNull(),
  placeOfSupply: text('place_of_supply').notNull(),
  sellerName: text('seller_name').notNull(),
  sellerGstin: text('seller_gstin'),
  sellerAddress: text('seller_address').notNull(),
  sac: text('sac').notNull(),
  kind: text('kind').notNull(),
  plan: text('plan'),
  credits: integer('credits').notNull(),
  taxable: money('taxable').notNull(),
  cgst: money('cgst').notNull(),
  sgst: money('sgst').notNull(),
  igst: money('igst').notNull(),
  total: money('total').notNull(),
}, (t) => [
  unique('partner_invoices_partner_id_key').on(t.partnerId, t.id),
  uniqueIndex('partner_invoices_purchase').on(t.purchaseId),
  uniqueIndex('partner_invoices_number').on(t.number),
  index('partner_invoices_partner').on(t.partnerId, t.issuedAt),
  index('partner_invoices_issued').on(t.issuedAt),
  foreignKey({ name: 'partner_invoices_purchase_fk', columns: [t.partnerId, t.purchaseId], foreignColumns: [partnerCreditPurchases.partnerId, partnerCreditPurchases.id] }).onDelete('restrict'),
  check('partner_invoices_money', sql`${t.total} = ${t.taxable} + ${t.cgst} + ${t.sgst} + ${t.igst}`),
])

/** One use of credits: a preview (V2a) or a turn (V3). Metadata and cost inputs only; its figures are ledger entries. */
export const partnerCreditUses = pgTable('partner_credit_uses', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  linkId: uuid('link_id').notNull(),
  memberId: uuid('member_id'),
  kind: text('kind').notNull(),
  what: text('what').notNull(),
  reserved: integer('reserved').notNull(),
  estimate: integer('estimate'),
  /** Drawn from real money only (Production): a test lot never pays for real model work (security H1). */
  realMoney: boolean('real_money').notNull(),
  listMicro: money('list_micro'),
  rateE4: integer('rate_e4'),
  loadingBp: integer('loading_bp').notNull().default(11_000),
  createdAt: createdAt(),
  closedAt: at('closed_at'),
  returnedAt: at('returned_at'),
  returnReason: text('return_reason'),
}, (t) => [
  unique('partner_credit_uses_partner_id_key').on(t.partnerId, t.id),
  index('partner_credit_uses_partner').on(t.partnerId, t.createdAt, t.id),
  index('partner_credit_uses_open').on(t.partnerId).where(sql`${t.closedAt} is null`),
  index('partner_credit_uses_link').on(t.partnerId, t.linkId, t.createdAt),
  index('partner_credit_uses_member').on(t.memberId, t.createdAt),
  foreignKey({ name: 'partner_credit_uses_link_fk', columns: [t.partnerId, t.linkId], foreignColumns: [partnerLinks.partnerId, partnerLinks.id] }).onDelete('restrict'),
  foreignKey({ name: 'partner_credit_uses_member_fk', columns: [t.partnerId, t.memberId], foreignColumns: [partnerMembers.partnerId, partnerMembers.id] }).onDelete('restrict'),
  check('partner_credit_uses_kind', sql`${t.kind} in (${list(USE_KINDS)}) and ${t.what} in (${list(USE_WHAT)})`),
  check('partner_credit_uses_reserved', sql`${t.reserved} between 1 and ${sql.raw(String(LIMITS.turnMax))}`),
  check('partner_credit_uses_cost', sql`(${t.listMicro} is null or ${t.listMicro} >= 0) and (${t.rateE4} is null or ${t.rateE4} > 0)`),
  check('partner_credit_uses_return', sql`(${t.returnedAt} is null or ${t.closedAt} is not null) and ((${t.returnedAt} is null) = (${t.returnReason} is null))
    and (${t.returnReason} is null or ${t.returnReason} in (${list(RETURN_REASONS)}))`),
])

/** The ledger: append-only lots and draws (src/domains/studio/ledger.ts). No definer updates or deletes a row. */
export const partnerCreditEntries = pgTable('partner_credit_entries', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  credits: integer('credits').notNull(),
  lotId: uuid('lot_id'),
  useId: uuid('use_id'),
  purchaseId: uuid('purchase_id'),
  expiresAt: at('expires_at'),
  test: boolean('test').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  unique('partner_credit_entries_partner_id_key').on(t.partnerId, t.id),
  index('partner_credit_entries_lots').on(t.partnerId, t.expiresAt, t.id).where(sql`${t.kind} in (${list(LOT_KINDS)})`),
  index('partner_credit_entries_use').on(t.useId).where(sql`${t.useId} is not null`),
  uniqueIndex('partner_credit_entries_one_grant').on(t.partnerId).where(sql`${t.kind} = 'grant'`),
  uniqueIndex('partner_credit_entries_one_lot_a_purchase').on(t.purchaseId).where(sql`${t.kind} in (${list(BOUGHT_LOTS)})`),
  foreignKey({ name: 'partner_credit_entries_lot_fk', columns: [t.partnerId, t.lotId], foreignColumns: [t.partnerId, t.id] }).onDelete('restrict'),
  foreignKey({ name: 'partner_credit_entries_use_fk', columns: [t.partnerId, t.useId], foreignColumns: [partnerCreditUses.partnerId, partnerCreditUses.id] }).onDelete('restrict'),
  foreignKey({ name: 'partner_credit_entries_purchase_fk', columns: [t.partnerId, t.purchaseId], foreignColumns: [partnerCreditPurchases.partnerId, partnerCreditPurchases.id] }).onDelete('restrict'),
  check('partner_credit_entries_kind', sql`${t.kind} in (${list(ENTRY_KINDS)})`),
  check('partner_credit_entries_lot', sql`(${t.kind} in (${list(LOT_KINDS)})) = (${t.lotId} is null)
    and (${t.kind} in (${list(LOT_KINDS)})) = (${t.expiresAt} is not null)`),
  check('partner_credit_entries_sign', sql`case when ${t.kind} in (${list(LOT_KINDS)}) or ${t.kind} = 'release' then ${t.credits} > 0 else ${t.credits} < 0 end`),
  // A use's reserve and its releases name the use; so does a 'return' lot, made when a use gives credits back to a lot
  // that has since ended (they come back for 12 months): charged = reserved − releases − return lots.
  check('partner_credit_entries_use', sql`case when ${t.kind} in ('reserve','release') then ${t.useId} is not null when ${t.kind} = 'return' then true else ${t.useId} is null end`),
  check('partner_credit_entries_bought', sql`(${t.kind} in (${list(BOUGHT_LOTS)})) = (${t.purchaseId} is not null) or ${t.kind} = 'clawback'`),
  check('partner_credit_entries_draw', sql`${t.kind} not in (${list(DRAW_KINDS)}) or not ${t.test}`),
])

/** A client's budget, set by the partner owner (owner call 3). "For the build" or "Each month" is derived from the
 *  store's handover, never stored. Keyed by the link (a store relinked starts again). */
export const partnerClientBudgets = pgTable('partner_client_budgets', {
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  linkId: uuid('link_id').notNull(),
  credits: integer('credits').notNull(),
  setBy: uuid('set_by').notNull(),
  setAt: at('set_at').notNull().defaultNow(),
  /** Set when the 80% email went; cleared when the budget is raised (one email a crossing). */
  warnedAt: at('warned_at'),
}, (t) => [
  primaryKey({ columns: [t.partnerId, t.linkId] }),
  foreignKey({ name: 'partner_client_budgets_link_fk', columns: [t.partnerId, t.linkId], foreignColumns: [partnerLinks.partnerId, partnerLinks.id] }).onDelete('restrict'),
  foreignKey({ name: 'partner_client_budgets_member_fk', columns: [t.partnerId, t.setBy], foreignColumns: [partnerMembers.partnerId, partnerMembers.id] }).onDelete('restrict'),
  check('partner_client_budgets_credits', sql`${t.credits} between 1 and ${sql.raw(String(MAX_BUDGET))}`),
])

/** The partner's emails, ids only (tenancy H4): never read by frata_admin; the recipient and words are made at send. */
export const partnerCreditNotices = pgTable('partner_credit_notices', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  linkId: uuid('link_id'),
  purchaseId: uuid('purchase_id'),
  dedupe: text('dedupe').notNull(),
  createdAt: createdAt(),
  sentAt: at('sent_at'),
  tries: smallint('tries').notNull().default(0),
  failedAt: at('failed_at'),
  error: text('error'),
}, (t) => [
  uniqueIndex('partner_credit_notices_dedupe').on(t.dedupe),
  index('partner_credit_notices_due').on(t.createdAt).where(sql`${t.sentAt} is null and ${t.failedAt} is null`),
  foreignKey({ name: 'partner_credit_notices_purchase_fk', columns: [t.partnerId, t.purchaseId], foreignColumns: [partnerCreditPurchases.partnerId, partnerCreditPurchases.id] }).onDelete('restrict'),
  check('partner_credit_notices_kind', sql`${t.kind} in (${list(NOTICE_KINDS)})`),
  check('partner_credit_notices_error', sql`${t.error} is null or length(${t.error}) <= 40`),
])

/** Mandates no longer used (a seat ended, a new one replaced it, a refunded start's), cancelled at the gateway by the hourly
 *  run: one row a token, due then done; a failure keeps its tries and reason for staff (C1·B, security H2 and M1). */
export const partnerMandateCancels = pgTable('partner_mandate_cancels', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  tokenId: text('token_id').notNull(),
  dueAt: at('due_at').notNull().defaultNow(),
  cancelledAt: at('cancelled_at'),
  tries: smallint('tries').notNull().default(0),
  error: text('error'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('partner_mandate_cancels_token').on(t.partnerId, t.tokenId),
  index('partner_mandate_cancels_due').on(t.dueAt).where(sql`${t.cancelledAt} is null`),
  check('partner_mandate_cancels_token_shape', sql`${t.tokenId} ~ '^token_[A-Za-z0-9]{6,40}$'`),
  check('partner_mandate_cancels_error', sql`${t.error} is null or length(${t.error}) <= 40`),
])

/** Person writes counted before they run (security L1); reserve and settle are not counted (speed L3). */
export const partnerCreditTries = pgTable('partner_credit_tries', {
  id: id(),
  userId: uuid('user_id').notNull(),
  kind: text('kind').notNull(),
  at: at('at').notNull().default(sql`now()`),
}, (t) => [
  index('partner_credit_tries_user').on(t.userId, t.kind, t.at),
  index('partner_credit_tries_at').on(t.at),
  check('partner_credit_tries_kind', sql`${t.kind} in (${list(TRY_KINDS)})`),
])

/** The day's USD/INR reference rate as rupees × 10,000 (94.1997 → 941997), one writer (owner 2026-11-22, 6). */
export const fxRates = pgTable('fx_rates', {
  day: date('day').primaryKey(),
  rateE4: integer('rate_e4').notNull(),
  source: text('source').notNull(),
  fetchedAt: at('fetched_at').notNull().defaultNow(),
}, (t) => [
  check('fx_rates_rate', sql`${t.rateE4} between 500000 and 2000000`),
  check('fx_rates_source', sql`${t.source} in (${list(RATE_SOURCES)})`),
])
