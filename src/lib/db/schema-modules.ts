// =============================================================================
// FILE: src/lib/db/schema-modules.ts — modules: switches, add-ons, prices, pauses
// (docs/specs/2026-11-07-modules-foundation.md § 2; access: drizzle/0028_modules_access.sql).
// Facts only: whether a module is usable is derived by moduleAccess(), never stored.
// CHECK lists are built from the registry (MODULE_KEYS, PLAN_GRANTABLE, ADD_ONS), so the two cannot drift.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { ADD_ONS, MODULE_KEYS, PLAN_GRANTABLE } from '@/domains/modules/registry'
import { sqlList } from '@/domains/tenancy/roles'
import { at, createdAt, id, money, tenants } from './schema'

/** The merchant's switch, with history: one row per time it was turned on; turning off closes the row. */
export const tenantModules = pgTable('tenant_modules', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  module: text('module').notNull(),
  enabledAt: at('enabled_at').notNull().defaultNow(),
  enabledBy: uuid('enabled_by').notNull(),
  disabledAt: at('disabled_at'),
  disabledBy: uuid('disabled_by'),
}, (t) => [
  uniqueIndex('tenant_modules_one_open').on(t.tenantId, t.module).where(sql`${t.disabledAt} is null`),
  index('tenant_modules_tenant').on(t.tenantId),
  check('tenant_modules_module', sql`${t.module} in (${sql.raw(sqlList(MODULE_KEYS))})`),
  check('tenant_modules_closed_by', sql`(${t.disabledAt} is null) = (${t.disabledBy} is null)`),
])

/** Versioned add-on prices: a new price is a new version, so nothing a merchant agreed to moves. Platform table. */
export const addonPrices = pgTable('addon_prices', {
  id: id(),
  module: text('module').notNull(),
  version: integer('version').notNull(),
  monthlyPrice: money('monthly_price').notNull(),
  createdAt: createdAt(),
  createdBy: uuid('created_by'),
}, (t) => [
  uniqueIndex('addon_prices_module_version').on(t.module, t.version),
  check('addon_prices_module', sql`${t.module} in (${sql.raw(sqlList(ADD_ONS))})`),
  check('addon_prices_price', sql`${t.monthlyPrice} >= 0`),
])

/**
 * A module granted to one shop beyond its plan: a paid add-on (at an addon_prices version) or a trial (until
 * trial_ends_at). Written by Frata Admin until billing exists (Phase 6). Ending one sets ends_at; rows are never deleted.
 */
export const tenantAddons = pgTable('tenant_addons', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  module: text('module').notNull(),
  addonPriceId: uuid('addon_price_id').references(() => addonPrices.id, { onDelete: 'restrict' }),
  startsAt: at('starts_at').notNull().defaultNow(),
  endsAt: at('ends_at'),
  trialEndsAt: at('trial_ends_at'),
  reason: text('reason'),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
}, (t) => [
  index('tenant_addons_tenant').on(t.tenantId),
  check('tenant_addons_module', sql`${t.module} in (${sql.raw(sqlList(PLAN_GRANTABLE))})`),
  check('tenant_addons_paid_or_trial', sql`(${t.addonPriceId} is not null) <> (${t.trialEndsAt} is not null)`),
])

/** Frata pauses a module for every shop (a vendor is down). Platform table; one open pause per module. */
export const modulePauses = pgTable('module_pauses', {
  id: id(),
  module: text('module').notNull(),
  pausedAt: at('paused_at').notNull().defaultNow(),
  pausedBy: uuid('paused_by').notNull(),
  reason: text('reason').notNull(),
  resumedAt: at('resumed_at'),
  resumedBy: uuid('resumed_by'),
}, (t) => [
  uniqueIndex('module_pauses_one_open').on(t.module).where(sql`${t.resumedAt} is null`),
  check('module_pauses_module', sql`${t.module} in (${sql.raw(sqlList(MODULE_KEYS))})`),
])
