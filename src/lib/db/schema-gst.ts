// =============================================================================
// FILE: src/lib/db/schema-gst.ts — GST filing from Frrata (GST app G2, plan docs/plans/2026-11-09-gst-core-and-categories.md
// § 3 phase 5; access: drizzle/0074). Behind a switch (src/lib/gst/switch.ts): off in production until a GSP is
// contracted and counsel has opined. A connection holds a sealed GSP session; a filing row is a period pushed and, once
// filed, final (trigger); every call is an attempt row BEFORE it is a request (ADR-0006, draft ADR-0008).
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, id, tenants } from './schema'

/** A shop's GST portal session through the GSP: one row per shop and GSTIN; disconnecting deletes the token. */
export const gstConnections = pgTable('gst_connections', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  gstin: text('gstin').notNull(),
  /** The GST portal username (not a secret; the portal asks for it with the OTP). */
  username: text('username').notNull(),
  /** seal(session, tenantId, 'gsp_session'). Null once disconnected or expired. */
  tokenEnc: text('token_enc'),
  expiresAt: at('expires_at'),
  connectedAt: at('connected_at').notNull().defaultNow(),
  connectedBy: uuid('connected_by').notNull(),
}, (t) => [
  uniqueIndex('gst_connections_shop').on(t.tenantId, t.gstin),
  check('gst_connections_gstin', sql`${t.gstin} ~ '^[0-9]{2}[A-Z0-9]{13}$'`),
  check('gst_connections_username', sql`length(${t.username}) between 1 and 60`),
])

/** A return period pushed to the portal and, once filed, final: what we sent, what the portal says it holds, the ARN. */
export const gstFilings = pgTable('gst_filings', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  gstin: text('gstin').notNull(),
  /** "2026-10" or "2026-Q3" (domains/tax/gstr1.ts periodOf). */
  period: text('period').notNull(),
  /** Our totals at the push (paise): taxable, igst, cgst, sgst, documents. */
  ours: jsonb('ours').$type<Record<string, number>>().notNull(),
  /** The portal's summary after the push, same keys. */
  portal: jsonb('portal').$type<Record<string, number>>(),
  pushRef: text('push_ref'),
  pushedAt: at('pushed_at').notNull(),
  pushedBy: uuid('pushed_by').notNull(),
  filedAt: at('filed_at'),
  filedBy: uuid('filed_by'),
  arn: text('arn'),
}, (t) => [
  uniqueIndex('gst_filings_period').on(t.tenantId, t.gstin, t.period),
  check('gst_filings_period_key', sql`${t.period} ~ '^[0-9]{4}-([0-9]{2}|Q[1-4])$'`),
  check('gst_filings_filed', sql`(${t.filedAt} is null) = (${t.arn} is null) and (${t.filedAt} is null) = (${t.filedBy} is null)`),
])

export const GST_ATTEMPT_KINDS = ['connect', 'verify', 'push', 'file'] as const
/** Every call to the GSP, written before it is made; its outcome after. Append-only but for the outcome. */
export const gstAttempts = pgTable('gst_attempts', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  period: text('period'),
  actor: uuid('actor').notNull(),
  startedAt: at('started_at').notNull().defaultNow(),
  /** pending → ok | failed. A pending row older than a few minutes is an unknown outcome: Check again on the portal. */
  outcome: text('outcome').notNull().default('pending'),
  /** The GSP's error code or our own word, never a token or an OTP. */
  error: text('error'),
  endedAt: at('ended_at'),
}, (t) => [
  index('gst_attempts_shop').on(t.tenantId, t.startedAt),
  check('gst_attempts_kind', sql`${t.kind} in ('connect','verify','push','file')`),
  check('gst_attempts_outcome', sql`${t.outcome} in ('pending','ok','failed')`),
  check('gst_attempts_error', sql`${t.error} is null or length(${t.error}) <= 200`),
])
