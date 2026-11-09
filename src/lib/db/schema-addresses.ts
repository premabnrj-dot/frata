// =============================================================================
// FILE: src/lib/db/schema-addresses.ts — A SHOP'S ADDRESSES (shop addresses D·1 names, D·2 own domains; plan
// docs/plans/2026-11-08-shop-addresses.md; access: drizzle/0068, 0069, 0081). tenants.slug mirrors the current name.
// =============================================================================
import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { BlockedKind } from '@/domains/addresses/names'
import { createdAt, id, tenants } from './schema'

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

/**
 * A merchant's own domain (shop addresses D2·2; plan docs/plans/2026-11-08-shop-addresses.md § D·2). One row per claim:
 * its state is DERIVED from the timestamps (src/domains/addresses/domains.ts stateOf), never a status column. A claim
 * is the shop's alone; a host is live for at most one shop (`proved_at` set, not removed). Every write goes through the
 * definers (D2·6); the app reads its own rows under RLS. `token` is 128 random bits, never derived from the host and
 * never changed by another shop's action; `vercel_txt` is Vercel's own proof when another Vercel account held it.
 */
export const shopDomains = pgTable('shop_domains', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  host: text('host').notNull(),
  /** The registrable domain (tldts): one live shop per apex, so www.<apex> can't go to another shop. */
  apex: text('apex').notNull(),
  /** www.<host> is connected too and sent to it (an apex); false for a subdomain. */
  withWww: boolean('with_www').notNull(),
  /** Made by the database (md5 of two random uuids: 128 bits), never passed in; unique across every row. */
  token: text('token').notNull().unique('shop_domains_token_unique').default(sql`md5(gen_random_uuid()::text || gen_random_uuid()::text)`),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  claimedBy: uuid('claimed_by').notNull(),
  provedAt: timestamp('proved_at', { withTimezone: true }),
  addedAt: timestamp('added_at', { withTimezone: true }),
  vercelTxt: text('vercel_txt'),
  dnsOkAt: timestamp('dns_ok_at', { withTimezone: true }),
  certOkAt: timestamp('cert_ok_at', { withTimezone: true }),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  failingSince: timestamp('failing_since', { withTimezone: true }),
  /** When this claim first found the host held live by another shop with that shop's proof gone (the 72 h hold). */
  contestAt: timestamp('contest_at', { withTimezone: true }),
  mainAt: timestamp('main_at', { withTimezone: true }),
  razorpayOkAt: timestamp('razorpay_ok_at', { withTimezone: true }),
  razorpayOkBy: uuid('razorpay_ok_by'),
  parkedAt: timestamp('parked_at', { withTimezone: true }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  removedReason: text('removed_reason'),
  removedBy: uuid('removed_by'),
}, (t) => [
  uniqueIndex('shop_domains_claim').on(t.tenantId, t.host).where(sql`removed_at is null`),
  uniqueIndex('shop_domains_live').on(t.host).where(sql`proved_at is not null and removed_at is null`),
  uniqueIndex('shop_domains_live_apex').on(t.apex).where(sql`proved_at is not null and removed_at is null`),
  uniqueIndex('shop_domains_main').on(t.tenantId).where(sql`main_at is not null and removed_at is null`),
  index('shop_domains_due').on(t.checkedAt).where(sql`removed_at is null or parked_at is not null`),
  check('shop_domains_host', sql`${t.host} = lower(${t.host}) and ${t.host} !~ '\\.$' and length(${t.host}) between 4 and 253 and ${t.host} ~ '^[a-z0-9.-]+$'
    and ${t.host} !~ '^www\\.' and ${t.host} !~ '(^|\\.)(frrata|frata)\\.' and ${t.host} !~ '(^|\\.)vercel\\.app$'
    and ${t.host} ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    and (${t.host} = ${t.apex} or ${t.host} like '%.' || ${t.apex})`),
  check('shop_domains_token', sql`${t.token} ~ '^[0-9a-f]{32}$'`),
  check('shop_domains_main_needs', sql`${t.mainAt} is null or (${t.provedAt} is not null and ${t.certOkAt} is not null)`),
  check('shop_domains_removed', sql`(${t.removedAt} is null) = (${t.removedReason} is null)`),
  // The order of things (tenancy audit D2·2): nothing happens to a domain before its own proof; a parked row is a
  // removed one still on Vercel; a removed row is never main; the Razorpay tick says who.
  check('shop_domains_after_proof', sql`${t.provedAt} is not null or (${t.addedAt} is null and ${t.dnsOkAt} is null and ${t.certOkAt} is null and ${t.razorpayOkAt} is null and ${t.mainAt} is null)`),
  check('shop_domains_parked', sql`${t.parkedAt} is null or ${t.removedAt} is not null`),
  check('shop_domains_removed_not_main', sql`${t.mainAt} is null or ${t.removedAt} is null`),
  check('shop_domains_razorpay_by', sql`(${t.razorpayOkAt} is null) = (${t.razorpayOkBy} is null)`),
])
