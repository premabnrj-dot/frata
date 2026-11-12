// =============================================================================
// FILE: src/lib/db/schema-delivery.ts — Delivery Zones (plan docs/plans/2026-11-12-delivery-zones.md; access and the
// starting rows: drizzle/0106_delivery_zones_access.sql). The shop's zones (≤ 50), the PIN codes or 3-digit prefixes its
// own zones list (≤ 5,000 a shop, one row each so checkout reads ONE by key), its PIN code rules (≤ 5,000) and holidays
// (≤ 60). Starting zones keep no PIN codes: they match by prefix in code (src/domains/delivery/presets.ts). Money paise.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, integer, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core'
import { PRESET_KEYS } from '@/domains/delivery/presets'
import { sqlList } from '@/domains/tenancy/roles'
import { at, id, money, tenants } from './schema'

export const DELIVERY_RULES = ['no_delivery', 'prepaid_only', 'cod_max'] as const

export const deliveryZones = pgTable('delivery_zones', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  preset: text('preset'),
  charge: money('charge').notNull(),
  freeAbove: money('free_above'),
  daysMin: integer('days_min').notNull(),
  daysMax: integer('days_max').notNull(),
  codOn: boolean('cod_on').notNull(),
  codFee: money('cod_fee').notNull().default(0),
  codMin: money('cod_min').notNull().default(0),
  codMax: money('cod_max'),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  index('delivery_zones_tenant').on(t.tenantId),
  // The pins table names a zone within its OWN shop (a foreign key check skips row policies, so the key holds the shop).
  unique('delivery_zones_tenant_id_key').on(t.tenantId, t.id),
  check('delivery_zones_name', sql`length(${t.name}) between 1 and 40`),
  check('delivery_zones_preset', sql`${t.preset} is null or ${t.preset} in (${sql.raw(sqlList(PRESET_KEYS))})`),
  check('delivery_zones_days', sql`${t.daysMin} between 0 and 60 and ${t.daysMax} between ${t.daysMin} and 60`),
  check('delivery_zones_money', sql`${t.charge} >= 0 and ${t.codFee} >= 0 and ${t.codMin} >= 0 and (${t.freeAbove} is null or ${t.freeAbove} > 0) and (${t.codMax} is null or ${t.codMax} > 0)`),
  check('delivery_zones_position', sql`${t.position} between 0 and 49`),
])

export const deliveryZonePins = pgTable('delivery_zone_pins', {
  tenantId: uuid('tenant_id').notNull(),
  /** A 6-digit PIN code or a 3-digit prefix. */
  pin: text('pin').notNull(),
  zoneId: uuid('zone_id').notNull(),
}, (t) => [
  primaryKey({ name: 'delivery_zone_pins_pk', columns: [t.tenantId, t.pin] }),
  foreignKey({ name: 'delivery_zone_pins_zone_fk', columns: [t.tenantId, t.zoneId], foreignColumns: [deliveryZones.tenantId, deliveryZones.id] }).onDelete('cascade'),
  index('delivery_zone_pins_zone').on(t.zoneId),
  check('delivery_zone_pins_pin', sql`${t.pin} ~ '^[1-9][0-9]{2}([0-9]{3})?$'`),
])

export const deliveryRules = pgTable('delivery_rules', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pincode: text('pincode').notNull(),
  rule: text('rule').notNull(),
  codMax: money('cod_max'),
  note: text('note'),
  createdAt: at('created_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ name: 'delivery_rules_pk', columns: [t.tenantId, t.pincode] }),
  check('delivery_rules_pin', sql`${t.pincode} ~ '^[1-9][0-9]{5}$'`),
  check('delivery_rules_rule', sql`${t.rule} in (${sql.raw(sqlList(DELIVERY_RULES))})`),
  check('delivery_rules_cod_max', sql`(${t.codMax} is not null and ${t.codMax} > 0) = (${t.rule} = 'cod_max')`),
  check('delivery_rules_note', sql`${t.note} is null or length(${t.note}) <= 120`),
])

export const shopHolidays = pgTable('shop_holidays', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  name: text('name').notNull(),
}, (t) => [
  primaryKey({ name: 'shop_holidays_pk', columns: [t.tenantId, t.day] }),
  check('shop_holidays_name', sql`length(${t.name}) between 1 and 60`),
])
