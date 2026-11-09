// =============================================================================
// FILE: src/lib/db/schema.ts
//
// Every merchant-owned table carries `tenant_id` and is guarded by the policy
// in drizzle/0001_tenant_isolation.sql (ADR-0002). Conventions (from Ekatan):
// enums are text + CHECK with a const tuple shared with TS; every foreign key
// is indexed; money is bigint paise; no status column where timestamps say it.
// =============================================================================

import { sql } from 'drizzle-orm'
import {
  bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'

export const id = () => uuid('id').primaryKey().defaultRandom()
export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
export const money = (name: string) => bigint(name, { mode: 'number' })

import { MEMBER_ROLES, sqlList, type MemberRole } from '@/domains/tenancy/roles'
import { PLAN_GRANTABLE } from '@/domains/modules/registry'
import type { BlockedKind } from '@/domains/addresses/names'
export { MEMBER_ROLES, type MemberRole }

export const tenants = pgTable('tenants', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** Frrata's own stores (the demo), shown as "Internal" in Admin. The plan is in tenant_plans. */
  isInternal: boolean('is_internal').notNull().default(false),
  createdAt: createdAt(),
  /** The first time the shop opened to shoppers; set once by a trigger, never cleared by a close (renames count from it). */
  firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),
  /** Frrata froze address changes (a name or domain dispute); set only through app_admin_freeze_address (0069). */
  addressFrozenAt: timestamp('address_frozen_at', { withTimezone: true }),
  /** Renames since the first opening: the limit's one count, raised only by app_change_shop_address (taking back an old name counts too). */
  renamesUsed: integer('renames_used').notNull().default(0),
})

/**
 * Every name a shop has had (shop addresses D·1). The primary key means a name is never given to a second shop; the
 * current one has no `retired_at`. A retired name redirects to the current one unless Frrata retired it. Written only by
 * the trigger on `tenants` and the rename and release definers (drizzle/0068, 0069); `tenants.slug` mirrors the current row.
 */
export const shopNames = pgTable('shop_names', {
  name: text('name').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  retiredByFrrata: boolean('retired_by_frrata').notNull().default(false),
}, (t) => [
  uniqueIndex('shop_names_current').on(t.tenantId).where(sql`retired_at is null`),
  index('shop_names_tenant').on(t.tenantId),
  check('shop_names_lower', sql`${t.name} = lower(${t.name})`),
])

/** Names and domains no shop may take: protected brands, offensive words, blocked domains (Admin, with a reason). Frrata's own routing words stay in code (RESERVED). */
export const blockedNames = pgTable('blocked_names', {
  name: text('name').primaryKey(),
  kind: text('kind').$type<BlockedKind>().notNull(),
  reason: text('reason').notNull(),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
}, (t) => [
  check('blocked_names_kind', sql`${t.kind} in ('protected','offensive','domain')`),
  check('blocked_names_lower', sql`${t.name} = lower(${t.name})`),
])

/** A merchant's own storefront domain. A platform subdomain (`<slug>.SHOP_DOMAIN`) is never stored: it is found by slug. */
export const tenantDomains = pgTable('tenant_domains', {
  host: text('host').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [index('tenant_domains_tenant').on(t.tenantId)])

/** Who may use a tenant's console. `user_id` is a Supabase auth user. */
export const members = pgTable('members', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.userId] }),
  index('members_user').on(t.userId),
  check('members_role', sql`${t.role} in (${sql.raw(sqlList(MEMBER_ROLES))})`),
])

// Orders, their lines and a shop's payment keys: src/lib/db/schema-orders.ts.

// ── Platform tables: not tenant-guarded by policy, listed in scripts/check-tenant.mjs ──

/** Every inbound webhook, stored BEFORE it is processed. The key makes a retry a no-op. */
export const webhookEvents = pgTable('webhook_events', {
  id: id(),
  provider: text('provider').notNull(),
  /** provider:event:object — our own key, not only the provider's event id. */
  eventKey: text('event_key').notNull().unique(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  lastError: text('last_error'),
}, (t) => [index('webhook_events_unprocessed').on(t.receivedAt).where(sql`${t.processedAt} is null`), index('webhook_events_tenant').on(t.tenantId)])

/** A call to the outside world is a row before it is a request (Ekatan's outbox). */
export const outbox = pgTable('outbox', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  /** e.g. whatsapp.utility, meta.capi, shiprocket.create */
  kind: text('kind').notNull(),
  /** Unique per tenant: two shops may queue the same thing. */
  dedupeKey: text('dedupe_key').notNull(),
  payload: jsonb('payload').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deadAt: timestamp('dead_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: createdAt(),
}, (t) => [
  index('outbox_due').on(t.nextAttemptAt).where(sql`${t.sentAt} is null and ${t.deadAt} is null`),
  uniqueIndex('outbox_tenant_dedupe').on(t.tenantId, t.dedupeKey),
])

// ── Phase A: Frrata admin (ADR-0007). Grants per role: drizzle/0005_admin.sql ──

export const at = (name: string) => timestamp(name, { withTimezone: true })

export const STAFF_ROLES = ['admin', 'support'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** Frrata staff. Platform scope: frata_app reads it only through app_access_for. */
export const platformStaff = pgTable('platform_staff', {
  userId: uuid('user_id').primaryKey(),
  email: text('email').notNull(),
  role: text('role').notNull(),
  createdAt: createdAt(),
  createdBy: uuid('created_by'),
}, (t) => [check('platform_staff_role', sql`${t.role} in ('admin','support')`)])

/** A store invitation, claimed at sign-in by a CONFIRMED email (app_claim_invites). */
export const invites = pgTable('invites', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull().default(sql`now() + interval '14 days'`),
  acceptedAt: at('accepted_at'),
  revokedAt: at('revoked_at'),
}, (t) => [
  index('invites_tenant').on(t.tenantId),
  index('invites_email_open').on(t.email).where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  check('invites_role', sql`${t.role} in ('owner','admin','staff')`),
  check('invites_email_lower', sql`${t.email} = lower(${t.email})`),
])

export const supportSessions = pgTable('support_sessions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  staffUserId: uuid('staff_user_id').notNull(),
  /** Snapshot at start, so the merchant's Activity can name the visitor. */
  staffEmail: text('staff_email').notNull(),
  reason: text('reason').notNull(),
  note: text('note'),
  startedAt: at('started_at').notNull().defaultNow(),
  expiresAt: at('expires_at').notNull(),
  endedAt: at('ended_at'),
}, (t) => [
  index('support_sessions_tenant').on(t.tenantId, t.startedAt),
  index('support_sessions_open').on(t.staffUserId).where(sql`${t.endedAt} is null`),
  check('support_sessions_reason', sql`${t.reason} in ('setup_help','fix_problem','merchant_asked')`),
])

/** Append-only: no role has update or delete. */
export const auditEvents = pgTable('audit_events', {
  id: id(),
  at: at('at').notNull().defaultNow(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }),
  actorUserId: uuid('actor_user_id').notNull(),
  actorEmail: text('actor_email'),
  actorKind: text('actor_kind').notNull(),
  supportSessionId: uuid('support_session_id').references(() => supportSessions.id, { onDelete: 'restrict' }),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail'),
}, (t) => [
  index('audit_events_tenant_at').on(t.tenantId, t.at),
  index('audit_events_at').on(t.at),
  index('audit_events_session').on(t.supportSessionId),
  check('audit_events_kind', sql`${t.actorKind} in ('member','staff','support')`),
])

export const plans = pgTable('plans', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
}, (t) => [check('plans_code', sql`${t.code} in ('launch','growth','scale')`)])

/** Never updated: a new price, fee or feature set is a new version. */
export const planVersions = pgTable('plan_versions', {
  id: id(),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'restrict' }),
  version: integer('version').notNull(),
  monthlyPrice: money('monthly_price').notNull(),
  includedOrders: integer('included_orders').notNull(),
  feeBps: integer('fee_bps').notNull(),
  features: text('features').array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
  createdBy: uuid('created_by'),
}, (t) => [
  uniqueIndex('plan_versions_plan_version').on(t.planId, t.version),
  check('plan_versions_features', sql`${t.features} <@ array[${sql.raw(sqlList(PLAN_GRANTABLE))}]::text[]`),
  check('plan_versions_fee', sql`${t.feeBps} between 0 and 10000`),
  check('plan_versions_numbers', sql`${t.monthlyPrice} >= 0 and ${t.includedOrders} >= 0`),
])

/** A store's plan history. The current plan is the latest row that has started (currentPlan). */
export const tenantPlans = pgTable('tenant_plans', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  planVersionId: uuid('plan_version_id').notNull().references(() => planVersions.id, { onDelete: 'restrict' }),
  startsAt: at('starts_at').notNull(),
  trialEndsAt: at('trial_ends_at'),
  customMonthlyPrice: money('custom_monthly_price'),
  reason: text('reason'),
  /** Billing B4: the shop changed its own plan (app_change_plan); never written by Admin (column grant). */
  byShop: boolean('by_shop').notNull().default(false),
  /** Trials TR0: an upgrade waiting for the trial to end (it carries no trial; app_trial_recompute moves its start). */
  waitsForTrial: boolean('waits_for_trial').notNull().default(false),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('tenant_plans_tenant_start').on(t.tenantId, t.startsAt),
  index('tenant_plans_version').on(t.planVersionId),
  check('tenant_plans_custom_reason', sql`${t.customMonthlyPrice} is null or ${t.reason} is not null`),
])

// ── Phase 1 (docs/plans/2026-11-06-phase-1-first-sale.md). RLS: drizzle/0008_phase1_access.sql ──

export const BRAND_ACCENTS = ['oxide', 'indigo', 'moss', 'wine', 'ink'] as const
export const DISPLAY_FONTS = ['fraunces', 'cormorant', 'inter'] as const
export const RETURN_KINDS = ['exchange_or_refund', 'exchange_only', 'refund_only', 'none'] as const
export { SELL_KEYS as SELLS } from '@/domains/catalogue/sell-keys'

/**
 * One row per shop: everything a merchant sets in Settings. The storefront,
 * policy pages, checkout and invoices read it; nothing copies it. The shop's
 * name is tenants.name and its address tenants.slug (+ the shop domain).
 */
export const shopSettings = pgTable('shop_settings', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  legalName: text('legal_name').notNull().default(''),
  address: text('address').notNull().default(''),
  originCountry: text('origin_country').notNull().default('India'),
  orderPrefix: text('order_prefix').notNull().default(''),
  supportEmail: text('support_email').notNull().default(''),
  supportPhone: text('support_phone').notNull().default(''),
  whatsapp: text('whatsapp').notNull().default(''),
  instagram: text('instagram').notNull().default(''),
  grievanceName: text('grievance_name').notNull().default(''),
  grievanceRole: text('grievance_role').notNull().default(''),
  grievanceEmail: text('grievance_email').notNull().default(''),
  grievancePhone: text('grievance_phone').notNull().default(''),
  accent: text('accent').notNull().default('oxide'),
  displayFont: text('display_font').notNull().default('fraunces'),
  /** The words Frrata writes on the shop (menus, buttons, delivery words): en or hi (themes T2). What the merchant types stays as typed. */
  shopLanguage: text('shop_language').notNull().default('en'),
  tagline: text('tagline').notNull().default(''),
  logoUrl: text('logo_url'),
  sells: text('sells').array().notNull().default(sql`'{}'::text[]`),
  returnDays: integer('return_days').notNull().default(7),
  returnKind: text('return_kind').notNull().default('exchange_or_refund'),
  codOn: boolean('cod_on').notNull().default(true),
  codMin: money('cod_min').notNull().default(0),
  codMax: money('cod_max').notNull().default(300000),
  /** What the SHOPPER pays for Pay on delivery, shown before ordering. Not codFee (the courier's cost). */
  codCharge: money('cod_charge').notNull().default(0),
  codBlockedPincodes: text('cod_blocked_pincodes').array().notNull().default(sql`'{}'::text[]`),
  shippingFlat: money('shipping_flat').notNull().default(7900),
  freeShippingAbove: money('free_shipping_above').notNull().default(199900),
  dispatchDays: integer('dispatch_days').notNull().default(2),
  metroDays: integer('metro_days').notNull().default(4),
  restDays: integer('rest_days').notNull().default(7),
  pricesIncludeGst: boolean('prices_include_gst').notNull().default(true),
  gstin: text('gstin'),
  /** The HSN a new product starts with (sign-up sets it from what the shop sells); never a fallback at checkout. */
  defaultHsn: text('default_hsn').notNull().default('6211'),
  /** GST scheme while registered (gstin set): regular charges GST; composition issues a bill of supply. No GSTIN = not registered. */
  gstScheme: text('gst_scheme').notNull().default('regular'),
  /** The shop's state code ('08'): from the GSTIN when registered; set by hand when not (unregistered and composition shops sell within it). */
  homeState: text('home_state'),
  /** Last year's aggregate turnover (rates.ts TURNOVER_BANDS): sets the HSN digits and when e-invoicing applies. */
  turnoverBand: text('turnover_band').notNull().default('under_5cr'),
  /** How GSTR-1 is filed: every month, or quarterly with IFF for B2B in the first two months (QRMP). */
  gstFiling: text('gst_filing').notNull().default('monthly'),
  /** Business buyers may ask for a GST invoice at checkout (their GSTIN on it). Off above ₹5 cr until e-invoicing. */
  b2bInvoices: boolean('b2b_invoices').notNull().default(true),
  invoiceSeries: text('invoice_series').notNull().default(''),
  /** Documents D2 (Settings › Documents): the signatory named on invoices, a footer note, the slip's default size. */
  /** The logo for paper: a PNG in the shop's Blob folder (tenants/<t>/documents/<uuid>.png), byte-checked when set. */
  docLogo: text('doc_logo'),
  docSignatory: text('doc_signatory').notNull().default(''),
  docNote: text('doc_note').notNull().default(''),
  slipSize: text('slip_size').notNull().default('a4'),
  /** Asked at sign-up; null for shops made before it (Admin-created). */
  pickupPincode: text('pickup_pincode'),
  /**
   * What shipping costs when the shop sends orders another way (Ship S·0, owner call S3): used for profit on orders not
   * shipped through Shiprocket, only once confirmed. Paise.
   */
  shipCostDelivery: money('ship_cost_delivery'),
  shipCostReturn: money('ship_cost_return'),
  shipCostCod: money('ship_cost_cod'),
  shipCostsConfirmedAt: at('ship_costs_confirmed_at'),
  publishedAt: at('published_at'),
  version: integer('version').notNull().default(1),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  check('shop_settings_accent', sql`${t.accent} in ('oxide','indigo','moss','wine','ink')`),
  check('shop_settings_font', sql`${t.displayFont} in ('fraunces','cormorant','inter')`),
  check('shop_settings_language', sql`${t.shopLanguage} in ('en','hi')`),
  check('shop_settings_return_kind', sql`${t.returnKind} in ('exchange_or_refund','exchange_only','refund_only','none')`),
  check('shop_settings_sells', sql`${t.sells} <@ array['women','men','kids','ethnic','accessories','footwear','jewellery','beauty','wellness']::text[]`),
  check('shop_settings_gst_scheme', sql`${t.gstScheme} in ('regular','composition')`),
  check('shop_settings_home_state', sql`${t.homeState} is null or ${t.homeState} ~ '^[0-9]{2}$'`),
  check('shop_settings_turnover', sql`${t.turnoverBand} in ('under_5cr','5_to_10cr','over_10cr')`),
  check('shop_settings_gst_filing', sql`${t.gstFiling} in ('monthly','quarterly')`),
  check('shop_settings_hsn', sql`${t.defaultHsn} ~ '^[0-9]{4}([0-9]{2}){0,2}$'`),
  check('shop_settings_money', sql`${t.codMin} >= 0 and ${t.codMax} >= 0 and ${t.codCharge} >= 0 and ${t.shippingFlat} >= 0 and ${t.freeShippingAbove} >= 0`),
  check('shop_settings_days', sql`${t.returnDays} between 0 and 60 and ${t.dispatchDays} between 0 and 30 and ${t.metroDays} between 0 and 30 and ${t.restDays} between 0 and 30`),
  check('shop_settings_gstin', sql`${t.gstin} is null or ${t.gstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
  check('shop_settings_pickup', sql`${t.pickupPincode} is null or ${t.pickupPincode} ~ '^[1-9][0-9]{5}$'`),
  check('shop_settings_ship_costs', sql`(${t.shipCostDelivery} is null or ${t.shipCostDelivery} between 0 and 1000000) and (${t.shipCostReturn} is null or ${t.shipCostReturn} between 0 and 1000000)
    and (${t.shipCostCod} is null or ${t.shipCostCod} between 0 and 1000000)
    and (${t.shipCostsConfirmedAt} is null or (${t.shipCostDelivery} is not null and ${t.shipCostReturn} is not null and ${t.shipCostCod} is not null))`),
  // The series heads the invoice number: series + '26-27/' + 5 digits must stay within GST's 16 characters (1D).
  check('shop_settings_invoice_series', sql`length(${t.invoiceSeries}) <= 5`),
  check('shop_settings_documents', sql`${t.slipSize} in ('a4','label') and length(${t.docSignatory}) <= 80 and length(${t.docNote}) <= 240`),
  // A logo for paper only from this shop's own documents folder, so a document never loads another shop's file.
  check('shop_settings_doc_logo', sql`${t.docLogo} is null or ${t.docLogo} ~ ('^https://[a-z0-9]+\\.public\\.blob\\.vercel-storage\\.com/tenants/' || ${t.tenantId}::text || '/documents/[0-9a-f-]{36}\\.png$')`),
])

export const COUNTER_KINDS = ['order', 'invoice', 'bill', 'credit'] as const

/** Order numbers and invoice series: `update … returning` in the transaction that uses the number. */
export const tenantCounters = pgTable('tenant_counters', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  /** '' for order numbers; the financial year ('2026-27') for invoices. */
  period: text('period').notNull().default(''),
  next: integer('next').notNull().default(1),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.kind, t.period] }),
  check('tenant_counters_kind', sql`${t.kind} in (${sql.raw(COUNTER_KINDS.map((k) => `'${k}'`).join(','))})`),
  check('tenant_counters_next', sql`${t.next} >= 1`),
])

/** India Post's pincode directory (data.gov.in, Open Government Data Licence). Reference data, no tenant. */
export const pincodes = pgTable('pincodes', {
  pincode: text('pincode').primaryKey(),
  city: text('city').notNull(),
  district: text('district').notNull(),
  state: text('state').notNull(),
}, (t) => [check('pincodes_shape', sql`${t.pincode} ~ '^[1-9][0-9]{5}$'`)])

/** Fixed-window counters for abuse limits. `key` is a sha256 (of action + ip/email/phone), never the value. */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').notNull(),
  windowStart: at('window_start').notNull(),
  n: integer('n').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index('rate_limits_window').on(t.windowStart)])

export const POLICY_KINDS = ['returns', 'shipping', 'privacy', 'terms', 'contact'] as const
export type PolicyKind = (typeof POLICY_KINDS)[number]

/** A policy page the merchant rewrote by hand. Absent = rendered from shop_settings (src/domains/policies/render.ts). */
export const shopPolicies = pgTable('shop_policies', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  body: text('body').notNull(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').notNull(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.kind] }),
  check('shop_policies_kind', sql`${t.kind} in ('returns','shipping','privacy','terms','contact')`),
  check('shop_policies_body', sql`length(${t.body}) between 1 and 20000`),
])

// The catalogue (1A) lives in ./schema-catalogue.ts; import its tables from there.

// Partners and their stores: src/lib/db/schema-partners.ts.
