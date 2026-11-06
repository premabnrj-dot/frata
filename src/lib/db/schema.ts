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

const id = () => uuid('id').primaryKey().defaultRandom()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const money = (name: string) => bigint(name, { mode: 'number' })

export const MEMBER_ROLES = ['owner', 'admin', 'staff'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const tenants = pgTable('tenants', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** Frata's own stores (the demo), shown as "Internal" in Admin. The plan is in tenant_plans. */
  isInternal: boolean('is_internal').notNull().default(false),
  createdAt: createdAt(),
})

/** A storefront host — a platform subdomain or the merchant's own domain. */
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
  check('members_role', sql`${t.role} in ('owner','admin','staff')`),
])

export const orders = pgTable('orders', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  /** The number a customer quotes: per tenant, not global. */
  number: integer('number').notNull(),
  paymentMethod: text('payment_method').notNull(),
  netRevenue: money('net_revenue').notNull(),
  cogs: money('cogs').notNull().default(0),
  forwardShipping: money('forward_shipping').notNull().default(0),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  ndrAt: timestamp('ndr_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  rtoInitiatedAt: timestamp('rto_initiated_at', { withTimezone: true }),
  rtoDeliveredAt: timestamp('rto_delivered_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('orders_tenant_number').on(t.tenantId, t.number),
  index('orders_tenant_placed').on(t.tenantId, t.placedAt),
  check('orders_payment_method', sql`${t.paymentMethod} in ('cod','prepaid')`),
])

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
  dedupeKey: text('dedupe_key').notNull().unique(),
  payload: jsonb('payload').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deadAt: timestamp('dead_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: createdAt(),
}, (t) => [index('outbox_due').on(t.nextAttemptAt).where(sql`${t.sentAt} is null and ${t.deadAt} is null`), index('outbox_tenant').on(t.tenantId)])

// ── Phase A: Frata admin (ADR-0007). Grants per role: drizzle/0005_admin.sql ──

const at = (name: string) => timestamp(name, { withTimezone: true })

export const STAFF_ROLES = ['admin', 'support'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** Frata staff. Platform scope: frata_app reads it only through app_access_for. */
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
  check('plan_versions_features', sql`${t.features} <@ array['rto_shield','size_fit','cart_flows']::text[]`),
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
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('tenant_plans_tenant_start').on(t.tenantId, t.startsAt),
  index('tenant_plans_version').on(t.planVersionId),
  check('tenant_plans_custom_reason', sql`${t.customMonthlyPrice} is null or ${t.reason} is not null`),
])
