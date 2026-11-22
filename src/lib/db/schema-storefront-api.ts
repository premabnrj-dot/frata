// =============================================================================
// FILE: src/lib/db/schema-storefront-api.ts
//
// STOREFRONT KEYS (ADR-0018 § 3; plan docs/plans/2026-11-15-v1-storefront-api.md § SA0·3). A key names its shop on the
// API host: the third source of a tenant id, resolved only by app_storefront_key (the definer) inside apiRequest.
// Stored is the key's sha256 as lowercase hex, never the key. Grants, RLS, the policy, the write-once trigger and the
// definer live in the migration's access half. When a key answers is decided by the definer, never stored: deleted
// (revoked_at), past expires_at, the store opened (test keys), the partner that made it gone, the Website not pointing
// at a live connected domain.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tenants } from './schema'
import { partners } from './schema-partners'

export const storefrontKeys = pgTable('storefront_keys', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  /** 'public' (Live on screen), 'test' or 'build' (ADR-0018 § 2 and its build-key amendment; KEY_KINDS in
   *  src/domains/storefront-api/keys.ts). */
  kind: text('kind').notNull(),
  /** Build keys only (G·2): what holds it, 'session' (a Studio session), 'preview' (one preview deployment) or
   *  'developer' (a partner person's computer, through the device sign-in). BUILD_PURPOSES. */
  purpose: text('purpose'),
  name: text('name').notNull(),
  /** sha256 of the key, lowercase hex: the lookup and the cache key (never decoded bytes; tenancy review H2). */
  hash: text('hash').notNull().unique('storefront_keys_hash_unique'),
  /** What people see of the key: its kind and the first 6 random characters. Never a lookup or a limit key. */
  prefix: text('prefix').notNull(),
  /** The partner whose person made it (set from the member row, never from input): its keys follow the partner. */
  partnerId: uuid('partner_id').references(() => partners.id, { onDelete: 'restrict' }),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
  /** Test keys: 30 days at most (TEST_KEY_DAYS). Build keys: 24 hours, a preview's 30 days at most (the access migration). */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  /** Delete on screen. Written once (trigger). */
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by'),
  lastSeenVersion: text('last_seen_version'),
  lastSeenOn: date('last_seen_on'),
}, (t) => [
  index('storefront_keys_tenant').on(t.tenantId, t.createdAt.desc()),
  check('storefront_keys_kind', sql`${t.kind} in ('public','test','build')`),
  check('storefront_keys_purpose', sql`(${t.kind} = 'build') = (${t.purpose} is not null) and (${t.purpose} is null or ${t.purpose} in ('session','preview','developer'))`),
  check('storefront_keys_name', sql`length(${t.name}) between 1 and 40 and ${t.name} = btrim(${t.name})`),
  check('storefront_keys_hash', sql`${t.hash} ~ '^[0-9a-f]{64}$'`),
  check('storefront_keys_prefix', sql`${t.prefix} ~ '^frs_(pub|test|build)_[0-9A-Za-z]{6}$' and starts_with(${t.prefix}, case ${t.kind} when 'public' then 'frs_pub_' else 'frs_' || ${t.kind} || '_' end)`),
  check('storefront_keys_expiry', sql`(${t.kind} in ('test','build')) = (${t.expiresAt} is not null)`),
  check('storefront_keys_revoked', sql`(${t.revokedAt} is null) = (${t.revokedBy} is null)`),
  check('storefront_keys_version', sql`${t.lastSeenVersion} is null or ${t.lastSeenVersion} ~ '^[0-9]{4}-[0-9]{2}$'`),
])

// G·3: a developer's device sign-in for a build key (ADR-0018's build-key amendment, point 1; Studio spec § 10). Platform
// scope until confirmed: the CLI holds a device secret and shows a short code; only their sha256 hex is stored, with the
// store the CLI named, for 10 minutes. A person confirms the code (a passkey check in the last 5 minutes), which binds it
// to them and that store; the CLI's next poll claims it once and the server mints the key. No Frrata role holds any
// privilege on the table: the app_device_code_* definers are the only door (the access migration; proof § 81).
export const buildKeyDeviceCodes = pgTable('build_key_device_codes', {
  id: id(),
  deviceHash: text('device_hash').notNull().unique('build_key_device_codes_device_unique'),
  codeHash: text('code_hash').notNull().unique('build_key_device_codes_code_unique'),
  storeSlug: text('store_slug').notNull(),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
}, (t) => [
  index('build_key_device_codes_expires').on(t.expiresAt),
  check('build_key_device_codes_hashes', sql`${t.deviceHash} ~ '^[0-9a-f]{64}$' and ${t.codeHash} ~ '^[0-9a-f]{64}$'`),
  check('build_key_device_codes_end', sql`${t.expiresAt} <= ${t.createdAt} + interval '10 minutes'`),
  check('build_key_device_codes_approved', sql`(${t.approvedAt} is null) = (${t.approvedBy} is null) and (${t.approvedAt} is null) = (${t.tenantId} is null)`),
  check('build_key_device_codes_claimed', sql`${t.claimedAt} is null or ${t.approvedAt} is not null`),
])
