import { bigint, check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { at, createdAt, id, platformStaff } from './schema'

// =============================================================================
// FILE: src/lib/db/schema-staff.ts — STAFF PASSKEYS (docs/specs/2026-11-12-staff-passkeys.md; ADR-0007 amended).
// Platform rows, no tenant. NO grant to any app role: every read and write goes through the app_staff_* definers
// (drizzle/0105), and app_access_for reads the step-ups. Every row belongs to a staff member and goes when they do
// (on delete cascade from platform_staff). Credential ids, public keys and challenges are base64url text; tokens and
// codes are stored only as SHA-256 hex.
// =============================================================================

/** A staff member's passkey. Found by (credential id, user) — never the credential alone. */
export const staffPasskeys = pgTable('staff_passkeys', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => platformStaff.userId, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  transports: text('transports').array().notNull().default(sql`'{}'::text[]`),
  name: text('name').notNull(),
  createdAt: createdAt(),
  lastUsedAt: at('last_used_at'),
}, (t) => [
  uniqueIndex('staff_passkeys_credential').on(t.credentialId),
  index('staff_passkeys_user').on(t.userId),
  check('staff_passkeys_name', sql`char_length(${t.name}) between 1 and 40`),
])

/** "Let me add a passkey": made by the person's own session, approved by another admin who types its code. */
export const staffEnrolmentRequests = pgTable('staff_enrolment_requests', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => platformStaff.userId, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull(),
  codeHash: text('code_hash').notNull(),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull(),
  approvedBy: uuid('approved_by').references(() => platformStaff.userId, { onDelete: 'cascade' }),
  approvedAt: at('approved_at'),
  usedAt: at('used_at'),
}, (t) => [index('staff_enrolment_requests_user').on(t.userId, t.createdAt)])

/** One WebAuthn challenge: bound to (user, session, purpose), 5 minutes, used once. */
export const staffWebauthnChallenges = pgTable('staff_webauthn_challenges', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => platformStaff.userId, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull(),
  purpose: text('purpose').notNull(),
  challenge: text('challenge').notNull(),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull(),
  usedAt: at('used_at'),
}, (t) => [
  index('staff_webauthn_challenges_user').on(t.userId, t.sessionId),
  check('staff_webauthn_challenges_purpose', sql`${t.purpose} in ('confirm','add')`),
])

/** A passkey check passed on one browser session: 12 hours, ended by sign-out, the passkey's removal or the person's. */
export const staffStepups = pgTable('staff_stepups', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => platformStaff.userId, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull(),
  passkeyId: uuid('passkey_id').notNull().references(() => staffPasskeys.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull(),
}, (t) => [
  uniqueIndex('staff_stepups_token').on(t.tokenHash),
  index('staff_stepups_user').on(t.userId, t.sessionId),
])

/** Tries, counted inside the definers by kind, failing closed: passkey checks 20 per session in 10 minutes and 60 per
 *  person an hour; requests 5 and 10; approvals (a wrong code is a guess) 5 and 10. */
export const staffPasskeyTries = pgTable('staff_passkey_tries', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => platformStaff.userId, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull(),
  kind: text('kind').notNull(),
  at: at('at').notNull().defaultNow(),
}, (t) => [
  index('staff_passkey_tries_user').on(t.userId, t.kind, t.at),
  check('staff_passkey_tries_kind', sql`${t.kind} in ('check','request','approve')`),
])

/**
 * Security emails about staff (staff passkeys spec § Design 5): a staff member added or removed, a request approved, a
 * passkey added or removed — one row per recipient (the person and every admin), written by the same definer and
 * transaction as the change (ADR-0006), sent by the 5-minute drain through SES's notices set. Platform rows, no grant.
 */
export const staffNotices = pgTable('staff_notices', {
  id: id(),
  toEmail: text('to_email').notNull(),
  kind: text('kind').notNull(),
  about: text('about').notNull(),
  byEmail: text('by_email'),
  detail: text('detail'),
  createdAt: createdAt(),
  attempts: integer('attempts').notNull().default(0),
  sentAt: at('sent_at'),
  lastError: text('last_error'),
}, (t) => [
  index('staff_notices_due').on(t.createdAt).where(sql`${t.sentAt} is null`),
  check('staff_notices_kind', sql`${t.kind} in ('staff_added','staff_removed','request_approved','passkey_added','passkey_removed')`),
])
