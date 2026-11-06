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
  bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
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
  /** Growth tier: launch | growth | scale. */
  plan: text('plan').notNull().default('launch'),
  createdAt: createdAt(),
}, (t) => [check('tenants_plan', sql`${t.plan} in ('launch','growth','scale')`)])

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
