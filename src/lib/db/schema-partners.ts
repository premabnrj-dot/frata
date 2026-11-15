// =============================================================================
// FILE: src/lib/db/schema-partners.ts — partners and the stores they built
// (docs/specs/2026-11-07-partner-foundations.md; access: drizzle/0023_partners_access.sql).
// The CHECK lists are built from the TS tuples (PARTNER_SERVICES, BRANDS_NOW), so the two cannot drift.
// =============================================================================

import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { BRANDS_NOW, PARTNER_SERVICES } from '@/domains/partners/terms'
import { PARTNER_ROLES } from '@/domains/partners/team'
import { sqlList } from '@/domains/tenancy/roles'
import { at, createdAt, id, tenants } from './schema'


/**
 * A developer, designer or agency who builds stores for brands. Platform scope: frata_app has NO grant and reads
 * its own row only through app_my_partner(uid); frata_admin reviews. Status is derived: applied → approved_at or
 * declined_at. Never a status column.
 */
export const partners = pgTable('partners', {
  id: id(),
  userId: uuid('user_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  businessName: text('business_name').notNull().default(''),
  phone: text('phone').notNull(),
  city: text('city').notNull(),
  services: text('services').array().notNull().default(sql`'{}'::text[]`),
  workUrl: text('work_url').notNull().default(''),
  brandsNow: text('brands_now').notNull(),
  termsVersion: integer('terms_version').notNull(),
  agreedAt: at('agreed_at').notNull(),
  appliedAt: at('applied_at').notNull().defaultNow(),
  approvedAt: at('approved_at'),
  approvedBy: uuid('approved_by'),
  declinedAt: at('declined_at'),
  declinedBy: uuid('declined_by'),
  declineReason: text('decline_reason'),
  /** Frrata paused this partner (Admin, admin_end_partner): every partner person's access ends; links and the share stay. */
  suspendedAt: at('suspended_at'),
  suspendedBy: uuid('suspended_by'),
  suspendReason: text('suspend_reason'),
}, (t) => [
  check('partners_services', sql`${t.services} <@ array[${sql.raw(sqlList(PARTNER_SERVICES.map(([k]) => k)))}]::text[]`),
  check('partners_brands_now', sql`${t.brandsNow} in (${sql.raw(sqlList(BRANDS_NOW.map(([k]) => k)))})`),
  check('partners_decided_once', sql`not (${t.approvedAt} is not null and ${t.declinedAt} is not null)`),
  index('partners_to_review').on(t.appliedAt).where(sql`${t.approvedAt} is null and ${t.declinedAt} is null`),
])

/**
 * One row per store a partner built: the attribution (created_at, set once when the store is created) and the
 * terms snapshotted from PARTNER_TERMS. share_starts_at is the shop's FIRST opening, written once by a trigger on
 * shop_settings.published_at, so closing and reopening never restarts the window. One active partner per store.
 */
export const partnerLinks = pgTable('partner_links', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
  shareBps: integer('share_bps').notNull(),
  shareMonths: integer('share_months').notNull(),
  noticeDays: integer('notice_days').notNull(),
  shareStartsAt: at('share_starts_at'),
  removedAt: at('removed_at'),
  removedBy: uuid('removed_by'),
}, (t) => [
  uniqueIndex('partner_links_one_active').on(t.tenantId).where(sql`${t.removedAt} is null`),
  index('partner_links_partner').on(t.partnerId),
  index('partner_links_tenant').on(t.tenantId),
  check('partner_links_terms', sql`${t.shareBps} between 0 and 10000 and ${t.shareMonths} > 0 and ${t.noticeDays} >= 0`),
])

/**
 * The people of a partner (T1a). An invite is a row with no user yet (`user_id` null), claimed only by the invited,
 * confirmed email on an explicit Accept. Platform scope like `partners`: frata_app has no grant (definers only);
 * frata_admin reads. One active partner per person; one active row per email within a partner.
 */
export const partnerMembers = pgTable('partner_members', {
  id: id(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  userId: uuid('user_id'),
  email: text('email').notNull(),
  role: text('role').notNull(),
  invitedBy: uuid('invited_by'),
  invitedAt: at('invited_at').notNull().defaultNow(),
  inviteExpiresAt: at('invite_expires_at'),
  acceptedAt: at('accepted_at'),
  removedAt: at('removed_at'),
  removedBy: uuid('removed_by'),
}, (t) => [
  uniqueIndex('partner_members_one_partner').on(t.userId).where(sql`${t.removedAt} is null and ${t.userId} is not null`),
  uniqueIndex('partner_members_email').on(t.partnerId, t.email).where(sql`${t.removedAt} is null`),
  index('partner_members_partner').on(t.partnerId),
  check('partner_members_role', sql`${t.role} in (${sql.raw(sqlList(PARTNER_ROLES))})`),
  check('partner_members_email_lower', sql`${t.email} = lower(${t.email})`),
  check('partner_members_accepted_user', sql`(${t.acceptedAt} is null) = (${t.userId} is null)`),
])

/** Which client stores a Lead (or, later, a Builder) works on. The owner works on every store of the partner. */
export const partnerAssignments = pgTable('partner_assignments', {
  partnerMemberId: uuid('partner_member_id').notNull().references(() => partnerMembers.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.partnerMemberId, t.tenantId] }),
  index('partner_assignments_tenant').on(t.tenantId),
])


// ════════ Partner passkeys (T1b; docs/plans/2026-11-12-studio-build.md § T1b, reviews folded in). The staff design
// (drizzle/0109) for a partner's people, every row bound to ONE membership (partner_member_id): a person removed from
// one partner never carries a passkey, request or check into another. Platform rows: no role holds any privilege; a
// restrictive deny-all policy; every read and write through the app_partner_pk_* definers (drizzle/0129). ════════

/** A partner person's passkey. Never returned by any definer: only its name and dates. */
export const partnerPasskeys = pgTable('partner_passkeys', {
  id: id(),
  partnerMemberId: uuid('partner_member_id').notNull().references(() => partnerMembers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  credentialId: text('credential_id').notNull(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  transports: text('transports').array().notNull().default(sql`'{}'::text[]`),
  name: text('name').notNull(),
  createdAt: createdAt(),
  lastUsedAt: at('last_used_at'),
}, (t) => [
  uniqueIndex('partner_passkeys_credential').on(t.credentialId),
  index('partner_passkeys_member').on(t.partnerMemberId),
  check('partner_passkeys_name', sql`char_length(${t.name}) between 1 and 40`),
])

/** "Let me add a passkey": the 6-digit code's hash, this browser session, who approved (the partner's owner for a
 *  Lead; a Frrata admin for the owner). `opens_at`: an owner who already has a passkey waits 24 hours (review H2). */
export const partnerPasskeyRequests = pgTable('partner_passkey_requests', {
  id: id(),
  partnerMemberId: uuid('partner_member_id').notNull().references(() => partnerMembers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  codeHash: text('code_hash').notNull(),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull(),
  opensAt: at('opens_at'),
  approvedBy: uuid('approved_by'),
  approvedKind: text('approved_kind'),
  approvedAt: at('approved_at'),
  usedAt: at('used_at'),
  /** The owner said no ("Decline request", partner sign-in mockup screen 10). */
  declinedAt: at('declined_at'),
  /** Context for the approver only (mockup screen 10): "Chrome on Android" from the user agent, the city from Vercel's
   *  edge. Each ≤ 60 characters; gone with the request (its member's removal cascades; a new request replaces it). */
  device: text('device'),
  city: text('city'),
}, (t) => [
  check('partner_passkey_requests_context', sql`(${t.device} is null or length(${t.device}) <= 60) and (${t.city} is null or length(${t.city}) <= 60)`),
  index('partner_passkey_requests_member').on(t.partnerMemberId, t.createdAt),
  // Admin › Today's passkey source (0138 admin_waiting_passkeys): open requests only (speed review on N4's plan).
  index('partner_passkey_requests_open').on(t.createdAt).where(sql`${t.usedAt} is null and ${t.declinedAt} is null and ${t.approvedAt} is null`),
  check('partner_passkey_requests_kind', sql`${t.approvedKind} is null or ${t.approvedKind} in ('owner','staff')`),
])

export const partnerWebauthnChallenges = pgTable('partner_webauthn_challenges', {
  id: id(),
  partnerMemberId: uuid('partner_member_id').notNull().references(() => partnerMembers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  purpose: text('purpose').notNull(),
  challenge: text('challenge').notNull(),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull(),
  usedAt: at('used_at'),
}, (t) => [
  index('partner_webauthn_challenges_user').on(t.userId, t.sessionId),
  check('partner_webauthn_challenges_purpose', sql`${t.purpose} in ('confirm','add')`),
])

/** A passkey check on this browser session: 12 hours, the cookie's token kept only as a hash (prefix `partner:`). */
export const partnerStepups = pgTable('partner_stepups', {
  id: id(),
  partnerMemberId: uuid('partner_member_id').notNull().references(() => partnerMembers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  passkeyId: uuid('passkey_id').notNull().references(() => partnerPasskeys.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull(),
}, (t) => [
  uniqueIndex('partner_stepups_token').on(t.tokenHash),
  index('partner_stepups_user').on(t.userId, t.sessionId),
])

export const partnerPasskeyTries = pgTable('partner_passkey_tries', {
  id: id(),
  userId: uuid('user_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  kind: text('kind').notNull(),
  at: at('at').notNull().default(sql`now()`),
}, (t) => [
  index('partner_passkey_tries_user').on(t.userId, t.kind, t.at),
  check('partner_passkey_tries_kind', sql`${t.kind} in ('check','request','approve')`),
])
