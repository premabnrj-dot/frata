// =============================================================================
// FILE: src/lib/db/schema-customers.ts — A SHOP'S OWN SHOPPERS (EkCode P1 task 3; ADR-0010: shaped for Messages M·1
// too). Tenant tables: grant, RLS and policy in drizzle/0087. One row per phone per shop — a guest and an EkCode
// shopper are the same row; `pairwise` is the shop's random EkCode id for them (never an account id). Sessions are
// the shop's own first-party sign-in (`__Host-shop_s`; only the token's sha256 is kept). Consents are per shop, per
// purpose, per channel and sender, with the notice version agreed to. Composite keys throughout, so no row can point
// at another shop's customer or order (tenancy review M4).
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, foreignKey, index, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from '@/lib/db/schema'
import { orders } from '@/lib/db/schema-orders'

export const shopCustomers = pgTable('shop_customers', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  name: text('name').notNull(),
  pairwise: uuid('pairwise'),
  source: text('source'),
  createdAt: createdAt(),
}, (t) => [
  unique('shop_customers_tenant_id_key').on(t.tenantId, t.id),
  uniqueIndex('shop_customers_tenant_phone').on(t.tenantId, t.phone),
  uniqueIndex('shop_customers_tenant_pairwise').on(t.tenantId, t.pairwise).where(sql`${t.pairwise} is not null`),
  check('shop_customers_phone', sql`${t.phone} ~ '^[6-9][0-9]{9}$'`),
  check('shop_customers_name', sql`length(${t.name}) between 1 and 80`),
])

export const customerSessions = pgTable('customer_sessions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull(),
  tokenDigest: text('token_digest').notNull(),
  /** The chosen address, sealed for this shop and this session; 24 h, then nulled. */
  prefillSealed: text('prefill_sealed'),
  prefillExpiresAt: at('prefill_expires_at'),
  /** EkCode's one-time token for "Save this address", sealed; used once after the order. */
  saveTokenSealed: text('save_token_sealed'),
  createdAt: createdAt(),
  expiresAt: at('expires_at').notNull(),
  revokedAt: at('revoked_at'),
}, (t) => [
  foreignKey({ name: 'customer_sessions_customer_fk', columns: [t.tenantId, t.customerId], foreignColumns: [shopCustomers.tenantId, shopCustomers.id] }).onDelete('cascade'),
  uniqueIndex('customer_sessions_tenant_token').on(t.tenantId, t.tokenDigest),
  index('customer_sessions_expiry').on(t.expiresAt),
])

export const CONSENT_PURPOSES = ['order_updates', 'marketing_whatsapp', 'marketing_email'] as const

export const customerConsents = pgTable('customer_consents', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull(),
  purpose: text('purpose').notNull(),
  channel: text('channel').notNull(),
  sender: text('sender').notNull(),
  /** "Updates for this order" names its order; a standing consent has none. */
  orderId: uuid('order_id'),
  noticeVersion: text('notice_version').notNull(),
  givenAt: at('given_at').notNull().defaultNow(),
  withdrawnAt: at('withdrawn_at'),
}, (t) => [
  foreignKey({ name: 'customer_consents_customer_fk', columns: [t.tenantId, t.customerId], foreignColumns: [shopCustomers.tenantId, shopCustomers.id] }).onDelete('cascade'),
  foreignKey({ name: 'customer_consents_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  index('customer_consents_customer').on(t.tenantId, t.customerId),
  check('customer_consents_purpose', sql`${t.purpose} in ('order_updates', 'marketing_whatsapp', 'marketing_email')`),
  check('customer_consents_channel', sql`${t.channel} in ('whatsapp', 'email')`),
  check('customer_consents_sender', sql`${t.sender} in ('shop', 'ekcode')`),
  check('customer_consents_version', sql`${t.noticeVersion} ~ '^[a-z-]+@[0-9]+$'`),
])
