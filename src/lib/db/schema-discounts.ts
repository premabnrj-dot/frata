// =============================================================================
// FILE: src/lib/db/schema-discounts.ts — offers: their terms, their codes, what an order got, and price history
// (docs/specs/2026-11-08-coupons.md; plan docs/plans/2026-11-08-offers.md; access: drizzle/0032_offers_access.sql).
// Money is paise, rates are bps. An offer's status (draft, scheduled, live, paused, ended) is DERIVED from its
// timestamps (src/domains/checkout/offer-status.ts); its uses are DERIVED from order_discounts and order state
// (discountUseSql). Every row carries tenant_id, and every link between shops' rows is a composite foreign key.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { DISCOUNT_STYLES } from '@/domains/checkout/discounts'
import { sqlList } from '@/domains/tenancy/roles'
import { at, createdAt, id, money, tenants } from './schema'
import { variants } from './schema-catalogue'
import { orders } from './schema-orders'

/** An offer's terms. A draft until started (a partner drafts; an owner or admin starts it: owner call 6). */
export const discounts = pgTable('discounts', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  /** Shown to shoppers (the bar, the checkout list, the order and invoice). */
  title: text('title').notNull(),
  style: text('style').notNull(),
  percentBps: integer('percent_bps'),
  amountOff: money('amount_off'),
  /** The most a percentage offer gives, in paise. */
  cap: money('cap'),
  minSubtotal: money('min_subtotal').notNull().default(0),
  /** Uses: whole-offer and per order phone (soft: phones are not verified). Null = no limit. */
  limitTotal: integer('limit_total'),
  limitPerPhone: integer('limit_per_phone'),
  /** The most this offer may give away in all, in paise. Never exceeded (an order that would cross it does not get it). */
  budget: money('budget'),
  startsAt: at('starts_at').notNull(),
  endsAt: at('ends_at'),
  /** Null: a draft. */
  startedAt: at('started_at'),
  startedBy: uuid('started_by'),
  pausedAt: at('paused_at'),
  /** Final: an ended offer never comes back (duplicate it instead). */
  endedAt: at('ended_at'),
  listed: boolean('listed').notNull().default(true),
  combinesWithPayment: boolean('combines_with_payment').notNull().default(true),
  /** The one offer in the shop's announcement bar. */
  announce: boolean('announce').notNull().default(false),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique('discounts_tenant_id_key').on(t.tenantId, t.id),
  index('discounts_tenant_live').on(t.tenantId).where(sql`${t.startedAt} is not null and ${t.endedAt} is null`),
  uniqueIndex('discounts_one_announce').on(t.tenantId).where(sql`${t.announce}`),
  check('discounts_style', sql`${t.style} in (${sql.raw(sqlList(DISCOUNT_STYLES))})`),
  check('discounts_value', sql`case when ${t.style} = 'free_shipping' then ${t.percentBps} is null and ${t.amountOff} is null and ${t.cap} is null
    else (${t.percentBps} is null) <> (${t.amountOff} is null) end`),
  check('discounts_money', sql`(${t.percentBps} is null or ${t.percentBps} between 1 and 10000) and (${t.amountOff} is null or ${t.amountOff} > 0)
    and (${t.cap} is null or ${t.cap} > 0) and ${t.minSubtotal} >= 0 and (${t.budget} is null or ${t.budget} > 0)
    and (${t.limitTotal} is null or ${t.limitTotal} > 0) and (${t.limitPerPhone} is null or ${t.limitPerPhone} > 0)`),
  check('discounts_window', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  check('discounts_title', sql`length(${t.title}) between 1 and 60`),
  check('discounts_started_by', sql`(${t.startedAt} is null) = (${t.startedBy} is null)`),
])

/** A shared code. Unique per shop FOREVER (case-insensitive): a used code is never handed to another offer. */
export const discountCodes = pgTable('discount_codes', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  discountId: uuid('discount_id').notNull(),
  code: text('code').notNull(),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: 'discount_codes_discount_fk', columns: [t.tenantId, t.discountId], foreignColumns: [discounts.tenantId, discounts.id] }).onDelete('restrict'),
  unique('discount_codes_tenant_discount_id_key').on(t.tenantId, t.discountId, t.id),
  uniqueIndex('discount_codes_tenant_code').on(t.tenantId, sql`upper(${t.code})`),
  index('discount_codes_discount').on(t.tenantId, t.discountId),
  check('discount_codes_code', sql`${t.code} ~ '^[A-Za-z0-9]{4,20}$'`),
])

/**
 * What an order got: one row per class, with the terms it was sold on copied as typed columns (the order keeps
 * them whatever the offer becomes). The payment row stays after a switch to COD: whether it applies is derived from
 * the way the order is paid now (discountUseSql).
 */
export const orderDiscounts = pgTable('order_discounts', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull(),
  discountId: uuid('discount_id').notNull(),
  codeId: uuid('code_id'),
  class: text('class').notNull(),
  /** The saving at placement, in paise (shipping: the delivery charge waived). */
  amount: money('amount').notNull(),
  title: text('title').notNull(),
  style: text('style').notNull(),
  percentBps: integer('percent_bps'),
  amountOff: money('amount_off'),
  cap: money('cap'),
  minSubtotal: money('min_subtotal').notNull(),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: 'order_discounts_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  foreignKey({ name: 'order_discounts_discount_fk', columns: [t.tenantId, t.discountId], foreignColumns: [discounts.tenantId, discounts.id] }).onDelete('restrict'),
  foreignKey({ name: 'order_discounts_code_fk', columns: [t.tenantId, t.discountId, t.codeId], foreignColumns: [discountCodes.tenantId, discountCodes.discountId, discountCodes.id] }).onDelete('restrict'),
  uniqueIndex('order_discounts_order_class').on(t.tenantId, t.orderId, t.class),
  index('order_discounts_discount').on(t.tenantId, t.discountId),
  check('order_discounts_class', sql`${t.class} in ('order','shipping','payment')`),
  check('order_discounts_amount', sql`${t.amount} > 0`),
])

/**
 * Every price a variant had, from when (written by a trigger on variants: drizzle/0032_offers_access.sql). The
 * 30-day prior price a struck price must show from 1 Jan 2027 is derived from it (E-Commerce Amendment Rules 2026).
 */
export const priceHistory = pgTable('price_history', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  variantId: uuid('variant_id').notNull(),
  price: money('price').notNull(),
  fromAt: at('from_at').notNull().defaultNow(),
}, (t) => [
  // Cascade: a never-ordered size is hard-deleted when a product's options change (retire-variants.ts).
  foreignKey({ name: 'price_history_variant_fk', columns: [t.tenantId, t.variantId], foreignColumns: [variants.tenantId, variants.id] }).onDelete('cascade'),
  index('price_history_variant').on(t.tenantId, t.variantId, t.fromAt),
])
