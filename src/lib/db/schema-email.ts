// =============================================================================
// FILE: src/lib/db/schema-email.ts — EMAIL AND NOTICES (plan docs/plans/2026-11-11-email.md; ADR-0011). Tenant tables:
// grants, RLS and policies in drizzle/0096. A message row holds no address and no body (the address lives on the order
// or in auth); its state is derived from its timestamps (src/domains/email/state.ts). Suppressions are keyed per shop
// (an HMAC over tenant and address), never comparable across shops. Notices are written only by definers, so a shop can
// never forge a "Frrata, required" notice; reads and preferences are per member.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from '@/lib/db/schema'
import { orders } from '@/lib/db/schema-orders'

export const EMAIL_KINDS = ['confirmed', 'finish_paying', 'shipped', 'delivered', 'cancelled', 'edited', 'test', 'invoice', 'notice', 'sign_in'] as const

export const emailMessages = pgTable('email_messages', {
  /** Our message id: travels to SES as tag `m` and comes back on every event. */
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  orderId: uuid('order_id'),
  /** The order event that caused it (dedupe and "was it undone?"). */
  eventId: uuid('event_id'),
  noticeId: uuid('notice_id'),
  userId: uuid('user_id'),
  providerId: text('provider_id'),
  createdAt: createdAt(),
  attemptedAt: at('attempted_at'),
  sentAt: at('sent_at'),
  deliveredAt: at('delivered_at'),
  bouncedAt: at('bounced_at'),
  bounceKind: text('bounce_kind'),
  complainedAt: at('complained_at'),
  failedAt: at('failed_at'),
  failedCode: text('failed_code'),
  skippedAt: at('skipped_at'),
  skipCode: text('skip_code'),
}, (t) => [
  foreignKey({ name: 'email_messages_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  index('email_messages_order').on(t.tenantId, t.orderId).where(sql`${t.orderId} is not null`),
  index('email_messages_tenant_created').on(t.tenantId, t.createdAt),
  uniqueIndex('email_messages_notice_user').on(t.noticeId, t.userId).where(sql`${t.noticeId} is not null`),
  check('email_messages_kind', sql`${t.kind} in ('confirmed','finish_paying','shipped','delivered','cancelled','edited','test','invoice','notice','sign_in')`),
  check('email_messages_codes', sql`(${t.failedCode} is null or ${t.failedCode} ~ '^[a-z0-9_]{1,48}$') and (${t.skipCode} is null or ${t.skipCode} ~ '^[a-z_]{1,24}$') and (${t.bounceKind} is null or ${t.bounceKind} in ('permanent','transient','undetermined'))`),
  check('email_messages_provider', sql`${t.providerId} is null or length(${t.providerId}) <= 200`),
])

export const emailSuppressions = pgTable('email_suppressions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  /** "<key id>:<hex>" — HMAC over this tenant and the lower-cased address (src/lib/email/hash.ts). */
  addressHash: text('address_hash').notNull(),
  reason: text('reason').notNull(),
  messageId: uuid('message_id'),
  at: at('at').notNull().defaultNow(),
  liftedAt: at('lifted_at'),
}, (t) => [
  uniqueIndex('email_suppressions_live').on(t.tenantId, t.addressHash).where(sql`${t.liftedAt} is null`),
  check('email_suppressions_reason', sql`${t.reason} in ('bounce','complaint')`),
  check('email_suppressions_hash', sql`${t.addressHash} ~ '^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$'`),
])

/** A shop's overrides of Frrata's words and its switches (absent row = on, Frrata's words). */
export const shopEmails = pgTable('shop_emails', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  offAt: at('off_at'),
  subject: text('subject'),
  preview: text('preview'),
  heading: text('heading'),
  message: text('message'),
  button: text('button'),
  updatedBy: uuid('updated_by'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ name: 'shop_emails_pk', columns: [t.tenantId, t.kind] }),
  check('shop_emails_kind', sql`${t.kind} in ('confirmed','finish_paying','shipped','delivered','cancelled','edited')`),
  check('shop_emails_lengths', sql`coalesce(length(${t.subject}),0) <= 120 and coalesce(length(${t.preview}),0) <= 140 and coalesce(length(${t.heading}),0) <= 80 and coalesce(length(${t.message}),0) <= 600 and coalesce(length(${t.button}),0) <= 30`),
])

/** Per shop: its SES tenant is set up, and its daily cap. */
export const emailShops = pgTable('email_shops', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  sesReadyAt: at('ses_ready_at'),
  dailyCap: integer('daily_cap').notNull().default(500),
  createdAt: createdAt(),
}, (t) => [check('email_shops_cap', sql`${t.dailyCap} between 0 and 1000000`)])

/** The cron's roll-up (speed review P6): Settings' 7-day strip and Admin health read this, never email_messages. */
export const emailDaily = pgTable('email_daily', {
  day: date('day').notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  sent: integer('sent').notNull().default(0),
  delivered: integer('delivered').notNull().default(0),
  bounced: integer('bounced').notNull().default(0),
  complained: integer('complained').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
}, (t) => [primaryKey({ name: 'email_daily_pk', columns: [t.tenantId, t.day] })])

export const notices = pgTable('notices', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  /** Where it came from (worded when rendered): billing_notice, support_session, handover, admin, addon_trial (A3: a
   *  self-serve trial's row, 3 days before it ends), edit_payment (OE·2: an edit waiting 24 hours for the shopper's payment). */
  sourceKind: text('source_kind').notNull(),
  sourceId: uuid('source_id'),
  /** Admin's own words (plain text); null for a source-worded notice. */
  title: text('title'),
  body: text('body'),
  href: text('href'),
  required: boolean('required').notNull().default(false),
  /** Also emailed (Admin's choice; source notices decide by type). */
  email: boolean('email').notNull().default(true),
  batchId: uuid('batch_id'),
  by: uuid('by'),
  createdAt: createdAt(),
}, (t) => [
  index('notices_tenant_created').on(t.tenantId, t.createdAt.desc()),
  check('notices_type', sql`${t.type} in ('billing','security','frrata_action','needs_you','product_update')`),
  check('notices_source', sql`${t.sourceKind} in ('billing_notice','support_session','handover','admin','addon_trial','edit_payment')`),
  check('notices_href', sql`${t.href} is null or ${t.href} ~ '^/console(/[A-Za-z0-9/_?=&.-]*)?$'`),
  check('notices_words', sql`coalesce(length(${t.title}),0) <= 120 and coalesce(length(${t.body}),0) <= 1000`),
  check('notices_required', sql`not ${t.required} or ${t.type} in ('billing','security','frrata_action')`),
])

export const noticeReads = pgTable('notice_reads', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  noticeId: uuid('notice_id').notNull().references(() => notices.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  readAt: at('read_at').notNull().defaultNow(),
}, (t) => [primaryKey({ name: 'notice_reads_pk', columns: [t.noticeId, t.userId] }), index('notice_reads_user').on(t.tenantId, t.userId)])

export const noticePrefs = pgTable('notice_prefs', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  email: boolean('email').notNull(),
}, (t) => [
  primaryKey({ name: 'notice_prefs_pk', columns: [t.tenantId, t.userId, t.type] }),
  check('notice_prefs_type', sql`${t.type} in ('needs_you','product_update','new_order')`),
])
