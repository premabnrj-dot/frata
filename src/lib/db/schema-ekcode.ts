// =============================================================================
// FILE: src/lib/db/schema-ekcode.ts — THE EKCODE VAULT (ADR-0009; plan docs/plans/2026-11-09-ekcode-p1.md task 3).
//
// Platform tables, outside every tenant. No app role holds any grant on them and each carries one restrictive
// "definer_only" policy (drizzle/0085, the 0065 pattern): they are read and written only by SECURITY DEFINER functions
// that re-check a proof. Phones, codes and network buckets are keyed hashes ("p1:<hex>", key id first); names, phones
// and addresses are sealed by the app with a key ring and the row's address as AAD. A shop never sees an account id:
// its id for a shopper is the random `ekcode_pairs.pairwise`, deleted when the shopper forgets that shop. Where a
// sign-in has got to is derived (src/domains/ekcode-core/flow.ts) — there is no status column.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from '@/lib/db/schema'

/** A timestamp named as given, set when the row is written (createdAt() always names its column created_at). */
const stamp = (name: string) => at(name).notNull().defaultNow()

const KEYED = sql.raw(`'^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$'`)

/** A shopper's EkCode: one per verified phone. */
export const ekcodeAccounts = pgTable('ekcode_accounts', {
  id: id(),
  phoneKey: text('phone_key').notNull(),
  phoneSealed: text('phone_sealed').notNull(),
  nameSealed: text('name_sealed').notNull(),
  /** The AAD the app seals this account's values with: random, never the id (no definer returns an account id). */
  sealRef: uuid('seal_ref').notNull(),
  createdAt: createdAt(),
  deletedAt: at('deleted_at'),
}, (t) => [
  uniqueIndex('ekcode_accounts_seal_ref').on(t.sealRef),
  uniqueIndex('ekcode_accounts_phone').on(t.phoneKey),
  check('ekcode_accounts_phone_key', sql`${t.phoneKey} ~ ${KEYED}`),
])

/** Addresses the shopper saved; sealed whole (lines, city, state, pincode). */
export const ekcodeAddresses = pgTable('ekcode_addresses', {
  id: id(),
  accountId: uuid('account_id').notNull().references(() => ekcodeAccounts.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  sealed: text('sealed').notNull(),
  createdAt: createdAt(),
  lastUsedAt: at('last_used_at'),
  deletedAt: at('deleted_at'),
}, (t) => [
  index('ekcode_addresses_account').on(t.accountId),
  check('ekcode_addresses_label', sql`length(${t.label}) between 1 and 20`),
])

/** Consents with their notice version: the network notice, and each share with a shop. */
export const ekcodeConsents = pgTable('ekcode_consents', {
  id: id(),
  accountId: uuid('account_id').notNull().references(() => ekcodeAccounts.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  noticeVersion: text('notice_version').notNull(),
  givenAt: stamp('given_at'),
  withdrawnAt: at('withdrawn_at'),
}, (t) => [
  index('ekcode_consents_account').on(t.accountId),
  check('ekcode_consents_kind', sql`(${t.kind} = 'network' and ${t.tenantId} is null) or (${t.kind} = 'share' and ${t.tenantId} is not null)`),
])

/** A shop's own id for a shopper: random, one per (account, shop), gone when the shopper forgets that shop. */
export const ekcodePairs = pgTable('ekcode_pairs', {
  accountId: uuid('account_id').notNull().references(() => ekcodeAccounts.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pairwise: uuid('pairwise').notNull().defaultRandom(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ name: 'ekcode_pairs_pk', columns: [t.accountId, t.tenantId] }),
  uniqueIndex('ekcode_pairs_pairwise').on(t.pairwise),
])

/** Every reveal to a shop, for the shopper's own page. */
export const ekcodeDisclosures = pgTable('ekcode_disclosures', {
  id: id(),
  accountId: uuid('account_id').notNull().references(() => ekcodeAccounts.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  items: text('items').array().notNull(),
  at: stamp('at'),
}, (t) => [index('ekcode_disclosures_account').on(t.accountId, t.at)])

/**
 * One sign-in, made by the shop's server (tenant and host from the Host header, never a URL: tenancy B1). The handle
 * travels in the redirect and the ekcode.in cookie; only its sha256 is stored. The rest of the flow's facts are on
 * its codes and grant.
 */
export const ekcodeFlows = pgTable('ekcode_flows', {
  id: id(),
  handleDigest: text('handle_digest').notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  host: text('host').notNull(),
  state: text('state').notNull(),
  challenge: text('challenge').notNull(),
  arm: text('arm').notNull(),
  startedAt: stamp('started_at'),
  numberInAt: at('number_in_at'),
  accountCreatedAt: at('account_created_at'),
}, (t) => [
  uniqueIndex('ekcode_flows_handle').on(t.handleDigest),
  index('ekcode_flows_started').on(t.startedAt),
  index('ekcode_flows_tenant_started').on(t.tenantId, t.startedAt),
  check('ekcode_flows_arm', sql`${t.arm} in ('shown', 'held')`),
  check('ekcode_flows_challenge', sql`${t.challenge} ~ '^[A-Za-z0-9_-]{43}$'`),
  check('ekcode_flows_state', sql`${t.state} ~ '^[A-Za-z0-9_-]{43}$'`),
])

/**
 * A code sent to a phone: the ADR-0008 attempt row (committed before the call), the meter, and — once verified — the
 * proof (its sha256, 10 minutes, used once by the grant).
 */
export const ekcodeCodes = pgTable('ekcode_codes', {
  id: id(),
  flowId: uuid('flow_id').notNull().references(() => ekcodeFlows.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  phoneKey: text('phone_key').notNull(),
  accountId: uuid('account_id').references(() => ekcodeAccounts.id, { onDelete: 'set null' }),
  codeHmac: text('code_hmac').notNull(),
  netNarrow: text('net_narrow'),
  netWide: text('net_wide'),
  powBits: smallint('pow_bits').notNull().default(0),
  createdAt: createdAt(),
  sentAt: at('sent_at'),
  wamid: text('wamid'),
  deliveredAt: at('delivered_at'),
  failedCode: integer('failed_code'),
  tries: smallint('tries').notNull().default(0),
  expiresAt: at('expires_at').notNull(),
  verifiedAt: at('verified_at'),
  proofDigest: text('proof_digest'),
  proofExpiresAt: at('proof_expires_at'),
  proofUsedAt: at('proof_used_at'),
}, (t) => [
  index('ekcode_codes_phone').on(t.phoneKey, t.createdAt.desc()),
  index('ekcode_codes_net').on(t.netNarrow, t.createdAt.desc()),
  index('ekcode_codes_net_wide').on(t.netWide, t.createdAt.desc()),
  index('ekcode_codes_tenant').on(t.tenantId, t.createdAt),
  index('ekcode_codes_created').on(t.createdAt),
  index('ekcode_codes_flow').on(t.flowId),
  uniqueIndex('ekcode_codes_wamid').on(t.wamid).where(sql`${t.wamid} is not null`),
  uniqueIndex('ekcode_codes_proof').on(t.proofDigest).where(sql`${t.proofDigest} is not null`),
  check('ekcode_codes_tries', sql`${t.tries} between 0 and 10`),
  check('ekcode_codes_phone_key', sql`${t.phoneKey} ~ ${KEYED}`),
])

/** The one-time code back to the shop (60 s; its sha256), and the save token for "Save this address" (24 h, once). */
export const ekcodeGrants = pgTable('ekcode_grants', {
  codeDigest: text('code_digest').primaryKey(),
  flowId: uuid('flow_id').notNull().references(() => ekcodeFlows.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => ekcodeAccounts.id, { onDelete: 'cascade' }),
  items: text('items').array().notNull(),
  addressId: uuid('address_id').references(() => ekcodeAddresses.id, { onDelete: 'set null' }),
  saveTokenDigest: text('save_token_digest'),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull(),
  usedAt: at('used_at'),
  saveUsedAt: at('save_used_at'),
}, (t) => [
  uniqueIndex('ekcode_grants_flow').on(t.flowId),
  uniqueIndex('ekcode_grants_save').on(t.saveTokenDigest).where(sql`${t.saveTokenDigest} is not null`),
])

/** EkCode's switches and limits, versioned (the newest row is in force); Admin writes a new row with a reason. */
export const ekcodeSettings = pgTable('ekcode_settings', {
  version: integer('version').primaryKey().generatedAlwaysAsIdentity(),
  signIn: boolean('sign_in').notNull().default(true),
  limits: jsonb('limits').notNull(),
  by: uuid('by'),
  reason: text('reason').notNull(),
  at: stamp('at'),
})

/** Per shop: a raised daily cap, extra proof-of-work while its breaker is tripped, and an Admin pause. */
export const ekcodeShopControls = pgTable('ekcode_shop_controls', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  raisedCap: integer('raised_cap'),
  extraPow: smallint('extra_pow').notNull().default(0),
  breakerAt: at('breaker_at'),
  pausedAt: at('paused_at'),
  pauseReason: text('pause_reason'),
  by: uuid('by'),
  updatedAt: stamp('updated_at'),
})

/** Blocked numbers or networks, by keyed hash; lifted, never deleted (the reason stays). */
export const ekcodeBlocks = pgTable('ekcode_blocks', {
  id: id(),
  kind: text('kind').notNull(),
  keyHash: text('key_hash').notNull(),
  reason: text('reason').notNull(),
  by: uuid('by').notNull(),
  at: stamp('at'),
  liftedAt: at('lifted_at'),
}, (t) => [
  uniqueIndex('ekcode_blocks_live').on(t.kind, t.keyHash).where(sql`${t.liftedAt} is null`),
  check('ekcode_blocks_kind', sql`${t.kind} in ('phone', 'net')`),
])

/** Meta's delivery reports for EkCode's number, trimmed to what a code needs; applied later, kept 2 days. */
export const ekcodeEvents = pgTable('ekcode_events', {
  eventKey: text('event_key').primaryKey(),
  wamid: text('wamid').notNull(),
  status: text('status').notNull(),
  errorCode: integer('error_code'),
  at: at('at').notNull(),
  receivedAt: stamp('received_at'),
  processedAt: at('processed_at'),
}, (t) => [index('ekcode_events_unprocessed').on(t.receivedAt).where(sql`${t.processedAt} is null`)])

/** Who saw the checkout in each arm, once a visitor a day (the holdout's denominator); rolled up nightly, then gone. */
export const ekcodeExposures = pgTable('ekcode_exposures', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  arm: text('arm').notNull(),
  visitorDigest: text('visitor_digest').notNull(),
}, (t) => [
  primaryKey({ name: 'ekcode_exposures_pk', columns: [t.tenantId, t.day, t.arm, t.visitorDigest] }),
  check('ekcode_exposures_arm', sql`${t.arm} in ('shown', 'held')`),
])

/** Closed days, per shop and arm, for Admin (speed review M4): read instead of scanning 30 days of rows. */
export const ekcodeDaily = pgTable('ekcode_daily', {
  day: date('day').notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  arm: text('arm').notNull(),
  visitors: integer('visitors').notNull().default(0),
  started: integer('started').notNull().default(0),
  codes: integer('codes').notNull().default(0),
  delivered: integer('delivered').notNull().default(0),
  verified: integer('verified').notNull().default(0),
  created: integer('created').notNull().default(0),
  continued: integer('continued').notNull().default(0),
}, (t) => [primaryKey({ name: 'ekcode_daily_pk', columns: [t.day, t.tenantId, t.arm] })])
