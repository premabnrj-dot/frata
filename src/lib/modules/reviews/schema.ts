// =============================================================================
// FILE: src/lib/modules/reviews/schema.ts — Reviews (docs/plans/2026-11-09-reviews-r1.md; access in the same migration).
//
// Tenant first in every key, composite foreign keys so a row can never point at another shop's order, line,
// product or review (tenancy audit R1). Where a review is (held, published, hidden, removed) is derived from its
// timestamps by src/domains/reviews/state.ts — there is no status column. No shopper phone or email is stored here:
// a review keeps the name its author chose ("Ananya R."), fixed at submit. frata_admin holds no grant on any of it.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, pgTable, primaryKey, smallint, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from '@/lib/db/schema'
import { sqlList } from '@/domains/tenancy/roles'
import { HIDE_REASONS, HOLD_REASONS, REPORT_REASONS } from '@/domains/reviews/moderation'
import { FITS } from '@/domains/reviews/summary'
import { ASK_DAYS, DEFAULT_ASK, MAX_PHOTOS, REMINDER_DAYS, REVIEW_TYPES } from '@/domains/reviews/schedule'
import { LIMITS, NAME_CHOICES } from '@/domains/reviews/text'

const nums = (xs: readonly number[]) => sql.raw(xs.join(','))
const words = (xs: readonly string[]) => sql.raw(sqlList(xs))
import { products } from '@/lib/db/schema-catalogue'
import { orders } from '@/lib/db/schema-orders'

/** One ask per order: the link's hash (never the token), when it was sent, reminded, opened. */
export const reviewRequests = pgTable('review_requests', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull(),
  /** 16 random bytes (hex) mixed into the link's HMAC, so a link can be reissued (security review M1). */
  tokenNonce: text('token_nonce').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: createdAt(),
  sentAt: at('sent_at'),
  remindedAt: at('reminded_at'),
  openedAt: at('opened_at'),
  /** The last send that failed for good (template refused, number gone): the reason is a code, never a phone. */
  failedAt: at('failed_at'),
  failCode: text('fail_code'),
}, (t) => [
  unique('review_requests_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'review_requests_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  uniqueIndex('review_requests_tenant_order').on(t.tenantId, t.orderId),
  uniqueIndex('review_requests_tenant_token').on(t.tenantId, t.tokenHash),
  index('review_requests_remind').on(t.tenantId, t.sentAt).where(sql`${t.remindedAt} is null and ${t.sentAt} is not null`),
  check('review_requests_nonce', sql`${t.tokenNonce} ~ '^[0-9a-f]{32}$'`),
])

export const reviews = pgTable('reviews', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  /** Null for an imported review. */
  requestId: uuid('request_id'),
  /** Null for an imported review, or once its line is deleted (the review stays, unlinked; an erased order takes it). */
  orderLineId: uuid('order_line_id'),
  productId: uuid('product_id').notNull(),
  source: text('source').notNull().default('request'),
  rating: smallint('rating').notNull(),
  title: text('title').notNull().default(''),
  body: text('body').notNull().default(''),
  fit: text('fit'),
  size: text('size'),
  displayName: text('display_name').notNull(),
  createdAt: createdAt(),
  heldAt: at('held_at'),
  heldReason: text('held_reason'),
  approvedAt: at('approved_at'),
  hiddenAt: at('hidden_at'),
  hiddenReason: text('hidden_reason'),
  editedAt: at('edited_at'),
  authorDeletedAt: at('author_deleted_at'),
  reply: text('reply').notNull().default(''),
  repliedAt: at('replied_at'),
}, (t) => [
  unique('reviews_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'reviews_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  foreignKey({ name: 'reviews_request_fk', columns: [t.tenantId, t.requestId], foreignColumns: [reviewRequests.tenantId, reviewRequests.id] }).onDelete('cascade'),
  // reviews_line_fk (tenant_id, order_line_id) → order_lines on delete set null (order_line_id): written in the
  // migration by hand — drizzle cannot say "set null on one column", and a plain set null would null tenant_id.
  uniqueIndex('reviews_tenant_line').on(t.tenantId, t.orderLineId),
  index('reviews_product_list').on(t.tenantId, t.productId, t.createdAt.desc()).where(sql`${t.hiddenAt} is null and ${t.authorDeletedAt} is null`),
  index('reviews_held').on(t.tenantId, t.createdAt).where(sql`${t.heldAt} is not null and ${t.approvedAt} is null and ${t.hiddenAt} is null`),
  index('reviews_hidden').on(t.tenantId, t.hiddenAt).where(sql`${t.hiddenAt} is not null`),
  check('reviews_rating', sql`${t.rating} between 1 and 5`),
  check('reviews_source', sql`${t.source} in ('request','import')`),
  check('reviews_request_source', sql`(${t.source} = 'request') = (${t.requestId} is not null)`),
  check('reviews_fit', sql`${t.fit} is null or ${t.fit} in (${words(FITS.map((f) => f.key))})`),
  check('reviews_text', sql`length(${t.title}) <= ${sql.raw(String(LIMITS.title))} and length(${t.body}) <= ${sql.raw(String(LIMITS.body))} and length(${t.reply}) <= ${sql.raw(String(LIMITS.reply))} and length(${t.displayName}) between 1 and ${sql.raw(String(LIMITS.name))}`),
  check('reviews_held_reason', sql`(${t.heldAt} is null) = (${t.heldReason} is null) and (${t.heldReason} is null or ${t.heldReason} in (${words(HOLD_REASONS)}))`),
  check('reviews_hidden_reason', sql`(${t.hiddenAt} is null) = (${t.hiddenReason} is null) and (${t.hiddenReason} is null or ${t.hiddenReason} in (${words(HIDE_REASONS.map((r) => r.key))}))`),
])

/** A review's photos: in this shop's reviews folder, under the request they were uploaded for (security review H2). */
export const reviewPhotos = pgTable('review_photos', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  reviewId: uuid('review_id').notNull(),
  base: text('base').notNull(),
  widths: integer('widths').array().notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  position: smallint('position').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: 'review_photos_review_fk', columns: [t.tenantId, t.reviewId], foreignColumns: [reviews.tenantId, reviews.id] }).onDelete('cascade'),
  uniqueIndex('review_photos_tenant_base').on(t.tenantId, t.base),
  index('review_photos_review').on(t.tenantId, t.reviewId),
  // Anchored (tenancy audit R1): our Blob host, this shop's reviews folder, one request folder, one file stem.
  check('review_photos_base', sql`${t.base} ~ ('^https://[a-z0-9]+\\.public\\.blob\\.vercel-storage\\.com/tenants/' || ${t.tenantId}::text || '/reviews/[0-9a-f-]{36}/[0-9a-f-]{36}$')`),
])

/** A shopper's report. The IP only as a keyed hash (security review M4); reports never hide a review on their own. */
export const reviewReports = pgTable('review_reports', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  reviewId: uuid('review_id').notNull(),
  reason: text('reason').notNull(),
  ipHash: text('ip_hash').notNull(),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: 'review_reports_review_fk', columns: [t.tenantId, t.reviewId], foreignColumns: [reviews.tenantId, reviews.id] }).onDelete('cascade'),
  uniqueIndex('review_reports_once').on(t.tenantId, t.reviewId, t.ipHash),
  index('review_reports_review').on(t.tenantId, t.reviewId),
  check('review_reports_reason', sql`${t.reason} in (${words(REPORT_REASONS)})`),
])

/** The shop's review settings (one row; absent = the defaults in src/domains/reviews). */
export const reviewSettings = pgTable('review_settings', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  askAfterDays: smallint('ask_after_days').notNull().default(DEFAULT_ASK.askAfterDays),
  remindAfterDays: smallint('remind_after_days').notNull().default(DEFAULT_ASK.remindAfterDays),
  reviewType: text('review_type').notNull().default(REVIEW_TYPES[0]),
  maxPhotos: smallint('max_photos').notNull().default(MAX_PHOTOS),
  fitQuestion: boolean('fit_question').notNull().default(true),
  approveEach: boolean('approve_each').notNull().default(false),
  widgetOn: boolean('widget_on').notNull().default(true),
  cardStars: boolean('card_stars').notNull().default(true),
  nameDefault: text('name_default').notNull().default('initial'),
  /** The ask template in the shop's own WhatsApp account (template.ts): Meta's id, status and category, as last
   *  read or pushed by Meta's webhook. Sends go only while it is APPROVED and UTILITY (H-utility). */
  templateId: text('template_id'),
  templateStatus: text('template_status'),
  templateCategory: text('template_category'),
  templateAt: at('template_at'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  check('review_settings_ask', sql`${t.askAfterDays} in (${nums(ASK_DAYS)})`),
  check('review_settings_remind', sql`${t.remindAfterDays} in (${nums(REMINDER_DAYS)})`),
  check('review_settings_type', sql`${t.reviewType} in (${words(REVIEW_TYPES)})`),
  check('review_settings_photos', sql`${t.maxPhotos} between 1 and ${sql.raw(String(MAX_PHOTOS))}`),
  check('review_settings_name', sql`${t.nameDefault} in (${words(NAME_CHOICES)})`),
])

/** Phones that said Stop, per shop, as a keyed hash only (security review H3): checked before every send. */
export const waOptOuts = pgTable('wa_opt_outs', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  phoneHmac: text('phone_hmac').notNull(),
  at: at('at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.phoneHmac] })])
