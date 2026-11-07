// =============================================================================
// FILE: src/lib/db/schema-partners.ts — partners and the stores they built
// (docs/specs/2026-11-07-partner-foundations.md; access: drizzle/0023_partners_access.sql).
// The CHECK lists are built from the TS tuples (PARTNER_SERVICES, BRANDS_NOW), so the two cannot drift.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { BRANDS_NOW, PARTNER_SERVICES } from '@/domains/partners/terms'
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
