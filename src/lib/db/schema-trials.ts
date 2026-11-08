// =============================================================================
// FILE: src/lib/db/schema-trials.ts — FREE TRIALS ON PLANS (trials TR0; spec docs/specs/2026-11-08-trials.md, plan
// docs/plans/2026-11-08-trials.md § Review findings, binding; access: drizzle/0063_trials_access.sql).
//
// The rules live in src/domains/plans/trial.ts; nothing here is a state. The ONE stored end that billing reads is
// tenant_plans.trial_ends_at, written only by app_trial_recompute from the facts below (every writer calls it).
// - trial_settings: Admin's terms for NEW sign-ups (one row). A running trial keeps the terms it started with.
// - shop_trials: one shop's terms, frozen when its trial is set up, and the facts the end is computed from.
// - trial_claims: one trial per business — keyed HMACs only (never the email, phone, GSTIN or account), no app grant.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, integer, pgTable, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from './schema'

export const trialSettings = pgTable('trial_settings', {
  id: smallint('id').primaryKey().default(1),
  days: integer('days').notNull().default(30),
  openWindowDays: integer('open_window_days').notNull().default(15),
  reason: text('reason'),
  updatedBy: uuid('updated_by'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  check('trial_settings_one', sql`${t.id} = 1`),
  check('trial_settings_days', sql`${t.days} between 7 and 45`),
  check('trial_settings_window', sql`${t.openWindowDays} between 0 and 30`),
])

export const shopTrials = pgTable('shop_trials', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  days: integer('days').notNull(),
  openWindowDays: integer('open_window_days').notNull(),
  signedUpAt: at('signed_up_at').notNull(),
  /** The first time the website went live: set once by the publish trigger, never reset. */
  startedAt: at('started_at'),
  extendedAt: at('extended_at'),
  extendedBy: uuid('extended_by'),
  endedAt: at('ended_at'),
  endedBy: uuid('ended_by'),
  createdAt: createdAt(),
}, (t) => [
  check('shop_trials_days', sql`${t.days} between 7 and 90`),
  check('shop_trials_window', sql`${t.openWindowDays} between 0 and 30`),
])

export const trialClaims = pgTable('trial_claims', {
  id: id(),
  kind: text('kind').notNull(),
  keyHmac: text('key_hmac').notNull(),
  keyVersion: smallint('key_version').notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  claimedAt: createdAt(),
}, (t) => [
  check('trial_claims_kind', sql`${t.kind} in ('email','phone','gstin','payout')`),
  uniqueIndex('trial_claims_key').on(t.kind, t.keyVersion, t.keyHmac),
])

/**
 * A sign-up code sent by WhatsApp (trials TR1; tenancy finding R2): platform data with NO tenant and no grant to any
 * app role — definers only. Keyed HMACs of the phone and the code (never the values); 10 minutes; at most 5 tries;
 * consumed once by app_create_shop_v2, which claims the phone for one trial per business.
 */
export const signupCodes = pgTable('signup_codes', {
  id: id(),
  userId: uuid('user_id').notNull(),
  phoneHmac: text('phone_hmac').notNull(),
  codeHmac: text('code_hmac').notNull(),
  keyVersion: smallint('key_version').notNull(),
  expiresAt: at('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  verifiedAt: at('verified_at'),
  consumedAt: at('consumed_at'),
  createdAt: createdAt(),
}, (t) => [
  check('signup_codes_attempts', sql`${t.attempts} between 0 and 5`),
])
