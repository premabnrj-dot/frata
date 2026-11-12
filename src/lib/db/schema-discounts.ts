// =============================================================================
// FILE: src/lib/db/schema-discounts.ts — offers: their terms, their codes, what an order got, and price history
// (docs/specs/2026-11-08-coupons.md; plan docs/plans/2026-11-08-offers.md; access: drizzle/0032_offers_access.sql).
// Money is paise, rates are bps. An offer's status (draft, scheduled, live, paused, ended) is DERIVED from its
// timestamps (src/domains/checkout/offer-status.ts); its uses are DERIVED from order_discounts and order state
// (discountUseSql). Every row carries tenant_id, and every link between shops' rows is a composite foreign key.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { DISCOUNT_STYLES } from '@/domains/checkout/discounts'
import { sqlList } from '@/domains/tenancy/roles'
import { at, createdAt, id, money, tenants } from './schema'
import { collections, products, variants } from './schema-catalogue'
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
  /** Stopped by Frrata staff (Admin's kill switch, O·4): not live until Frrata resumes it. The shop cannot clear it. */
  stoppedAt: at('stopped_at'),
  stoppedBy: uuid('stopped_by'),
  stopReason: text('stop_reason'),
  listed: boolean('listed').notNull().default(true),
  combinesWithPayment: boolean('combines_with_payment').notNull().default(true),
  /** Product offers: every product, or the products / collections in discount_targets (O·2). */
  targets: text('targets').notNull().default('all'),
  /** Buy X get Y: X, Y, and the % off the Y pieces in bps (10000 = free). */
  buyQty: integer('buy_qty'), getQty: integer('get_qty'), getBps: integer('get_bps'),
  /** Free gift: the piece that is free above min_subtotal. Set null if the variant goes (the offer then gives nothing). */
  giftVariantId: uuid('gift_variant_id'),
  /** Only for a phone with no order at this shop (decided at placement). */
  firstOrder: boolean('first_order').notNull().default(false),
  /** In the shop's announcement bar (one started offer at a time; a draft takes it when it starts). */
  announce: boolean('announce').notNull().default(false),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique('discounts_tenant_id_key').on(t.tenantId, t.id),
  index('discounts_tenant_live').on(t.tenantId).where(sql`${t.startedAt} is not null and ${t.endedAt} is null`),
  // One offer in the bar among started ones: a draft may ask for the bar and takes it when it starts.
  uniqueIndex('discounts_one_announce').on(t.tenantId).where(sql`${t.announce} and ${t.startedAt} is not null and ${t.endedAt} is null`),
  check('discounts_style', sql`${t.style} in (${sql.raw(sqlList(DISCOUNT_STYLES))})`),
  // free_shipping, bxgy, free_gift: no % or ₹; order_off: one of them, or neither when it has tiers; the rest: exactly one.
  check('discounts_value', sql`case ${t.style}
    when 'free_shipping' then ${t.percentBps} is null and ${t.amountOff} is null and ${t.cap} is null
    when 'bxgy' then ${t.percentBps} is null and ${t.amountOff} is null and ${t.buyQty} between 1 and 10 and ${t.getQty} between 1 and 10 and ${t.getBps} between 1 and 10000
    when 'free_gift' then ${t.percentBps} is null and ${t.amountOff} is null
    when 'order_off' then not (${t.percentBps} is not null and ${t.amountOff} is not null)
    else (${t.percentBps} is null) <> (${t.amountOff} is null) end`),
  check('discounts_targets', sql`${t.targets} in ('all','products','collections')`),
  check('discounts_money', sql`(${t.percentBps} is null or ${t.percentBps} between 1 and 10000) and (${t.amountOff} is null or ${t.amountOff} > 0)
    and (${t.cap} is null or ${t.cap} > 0) and ${t.minSubtotal} >= 0 and (${t.budget} is null or ${t.budget} > 0)
    and (${t.limitTotal} is null or ${t.limitTotal} > 0) and (${t.limitPerPhone} is null or ${t.limitPerPhone} > 0)`),
  check('discounts_window', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  check('discounts_title', sql`length(${t.title}) between 1 and 60`),
  check('discounts_started_by', sql`(${t.startedAt} is null) = (${t.startedBy} is null)`),
  check('discounts_stopped', sql`(${t.stoppedAt} is null) = (${t.stoppedBy} is null) and (${t.stoppedAt} is null) = (${t.stopReason} is null)
    and (${t.stopReason} is null or length(${t.stopReason}) between 3 and 300)`),
])

/** What a product offer covers when its targets are products or collections (exactly one per row). */
export const discountTargets = pgTable('discount_targets', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  discountId: uuid('discount_id').notNull(),
  productId: uuid('product_id'),
  collectionId: uuid('collection_id'),
}, (t) => [
  foreignKey({ name: 'discount_targets_discount_fk', columns: [t.tenantId, t.discountId], foreignColumns: [discounts.tenantId, discounts.id] }).onDelete('cascade'),
  foreignKey({ name: 'discount_targets_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  foreignKey({ name: 'discount_targets_collection_fk', columns: [t.tenantId, t.collectionId], foreignColumns: [collections.tenantId, collections.id] }).onDelete('cascade'),
  index('discount_targets_discount').on(t.tenantId, t.discountId),
  check('discount_targets_one', sql`(${t.productId} is null) <> (${t.collectionId} is null)`),
])

/** An order offer's steps: from `min_subtotal`, this % or ₹ off (the highest step reached applies). */
export const discountTiers = pgTable('discount_tiers', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  discountId: uuid('discount_id').notNull(),
  minSubtotal: money('min_subtotal').notNull(),
  percentBps: integer('percent_bps'),
  amountOff: money('amount_off'),
}, (t) => [
  foreignKey({ name: 'discount_tiers_discount_fk', columns: [t.tenantId, t.discountId], foreignColumns: [discounts.tenantId, discounts.id] }).onDelete('cascade'),
  uniqueIndex('discount_tiers_step').on(t.tenantId, t.discountId, t.minSubtotal),
  check('discount_tiers_value', sql`(${t.percentBps} is null) <> (${t.amountOff} is null) and (${t.percentBps} is null or ${t.percentBps} between 1 and 10000)
    and (${t.amountOff} is null or ${t.amountOff} > 0) and ${t.minSubtotal} > 0`),
])

/** A shared code. Unique per shop FOREVER (case-insensitive): a used code is never handed to another offer. */
export const discountCodes = pgTable('discount_codes', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  discountId: uuid('discount_id').notNull(),
  code: text('code').notNull(),
  /** A creator's name for a creator code; null for the offer's one public code. */
  label: text('label'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('discount_codes_one_public').on(t.tenantId, t.discountId).where(sql`${t.label} is null`),
  check('discount_codes_label', sql`${t.label} is null or length(${t.label}) between 1 and 40`),
  foreignKey({ name: 'discount_codes_discount_fk', columns: [t.tenantId, t.discountId], foreignColumns: [discounts.tenantId, discounts.id] }).onDelete('restrict'),
  unique('discount_codes_tenant_discount_id_key').on(t.tenantId, t.discountId, t.id),
  uniqueIndex('discount_codes_tenant_code').on(t.tenantId, sql`upper(${t.code})`),
  index('discount_codes_discount').on(t.tenantId, t.discountId),
  check('discount_codes_code', sql`${t.code} ~ '^[A-Za-z0-9]{4,20}$'`),
])

/**
 * What an order got: one row per offer — one per class, except two order offers when the ways of paying took different
 * ones (`method`) — with the terms it was sold on copied as typed columns (the order keeps
 * them whatever the offer becomes). The payment row stays after a switch to COD: whether it applies is derived from
 * the way the order is paid now (discountUseSql, by the row's way: offerWay of its class and `method`).
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
  /** How it reached the order: by itself, a typed code, or a code from a link (?code=). For O·3's leak alert. */
  via: text('via').notNull().default('auto'),
  /**
   * An order offer for one way of paying only (shop stress test 2026-11-11): placed online when the best order offer
   * does not combine with the pay-online saving and the saving (with any order offer that combines) costs less, the
   * one that went with it is 'prepaid' and the one paying on delivery gets is 'cod' — so a switch to COD and a capture
   * after it reprice from the order alone. Null: as its class says (the saving online, everything else both ways).
   */
  method: text('method'),
  /**
   * The rest of the terms it was sold on (src/domains/checkout/kept-terms.ts), so an order edit re-plans the order's own
   * offers (replanKept) whatever the offer becomes. Null where the style has none, and on rows placed before 0110 (a
   * product offer's then: not known). A tiered order offer: its every step's minimum, and each step's % or each step's ₹
   * (the offer's kind: one of the two lists, of the same length; never a null inside a list).
   */
  tierMins: money('tier_mins').array(), tierPercentBps: integer('tier_percent_bps').array(), tierAmountsOff: money('tier_amounts_off').array(),
  /** A product offer: 'all' products, or 'products' and their ids (a collection as its products at placement). */
  targets: text('targets'), targetProducts: uuid('target_products').array(),
  /** Buy X get Y: X, Y and the % off the Y pieces in bps. */
  buyQty: integer('buy_qty'), getQty: integer('get_qty'), getBps: integer('get_bps'),
  /** A free gift: the piece made free (a copy of the term, not a link: the variant may go). */
  giftVariantId: uuid('gift_variant_id'),
  /** An order edit took it off (it no longer applies, or now gives another amount: a new row carries that). Uses,
   *  budgets and the order's money read only the rows without it; the amount is never changed (OE·1). */
  removedAt: timestamp('removed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: 'order_discounts_order_fk', columns: [t.tenantId, t.orderId], foreignColumns: [orders.tenantId, orders.id] }).onDelete('cascade'),
  foreignKey({ name: 'order_discounts_discount_fk', columns: [t.tenantId, t.discountId], foreignColumns: [discounts.tenantId, discounts.id] }).onDelete('restrict'),
  foreignKey({ name: 'order_discounts_code_fk', columns: [t.tenantId, t.discountId, t.codeId], foreignColumns: [discountCodes.tenantId, discountCodes.discountId, discountCodes.id] }).onDelete('restrict'),
  // One live use of an offer per order; an edit's removed rows stay beside it.
  uniqueIndex('order_discounts_order_offer').on(t.tenantId, t.orderId, t.discountId).where(sql`${t.removedAt} is null`),
  index('order_discounts_discount').on(t.tenantId, t.discountId),
  check('order_discounts_class', sql`${t.class} in ('product','order','shipping','payment')`),
  check('order_discounts_via', sql`${t.via} in ('auto','typed','link')`),
  check('order_discounts_amount', sql`${t.amount} > 0`),
  check('order_discounts_method', sql`${t.method} is null or (${t.class} = 'order' and ${t.method} in ('cod','prepaid'))`),
  check('order_discounts_tiers', sql`case when ${t.tierMins} is null then ${t.tierPercentBps} is null and ${t.tierAmountsOff} is null
    else ${t.class} = 'order' and cardinality(${t.tierMins}) >= 1 and array_position(${t.tierMins}, null) is null
      and (${t.tierPercentBps} is null) <> (${t.tierAmountsOff} is null)
      and coalesce(cardinality(${t.tierPercentBps}), cardinality(${t.tierAmountsOff})) = cardinality(${t.tierMins})
      and array_position(coalesce(${t.tierPercentBps}, '{}'), null) is null and array_position(coalesce(${t.tierAmountsOff}, '{}'), null) is null end`),
  check('order_discounts_targets', sql`(${t.targets} is null or (${t.class} = 'product' and ${t.targets} in ('all','products')))
    and coalesce(${t.targets} = 'products', false) = (${t.targetProducts} is not null)`),
  check('order_discounts_bxgy', sql`(${t.buyQty} is null) = (${t.getQty} is null) and (${t.buyQty} is null) = (${t.getBps} is null)
    and (${t.buyQty} is null or (${t.style} = 'bxgy' and ${t.buyQty} between 1 and 10 and ${t.getQty} between 1 and 10 and ${t.getBps} between 1 and 10000))`),
  check('order_discounts_gift', sql`${t.giftVariantId} is null or ${t.style} = 'free_gift'`),
])

/**
 * Every price a variant had, from when (written by a trigger on variants: drizzle/0032_offers_access.sql). The trigger
 * runs as the caller: any role that changes a price (today only frata_app) needs insert on price_history too. The
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
