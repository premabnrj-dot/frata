// =============================================================================
// FILE: src/lib/db/schema-views.ts — SAVED VIEWS OF A LIST (Neel N1c·2). Access: drizzle/0126_saved_views_access.sql.
// =============================================================================
import { sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tenants } from './schema'

/**
 * A view of the Orders list kept as a tab for the whole team (Neel N1c, § Finding: "+ Save view"): a queue tab and
 * the filters in their canonical address form (src/domains/orders/filters.ts filterQuery; never a search), re-parsed
 * whenever it is read. Removed with Undo (removed_at; restored by id while its name is free). ≤ 20 a shop, counted
 * under an advisory lock in the action. 
 */
export const savedViews = pgTable('saved_views', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tab: text('tab').notNull(),
  query: text('query').notNull().default(''),
  /** The auth user who saved it (no FK to members: a Frrata support visit saves too). */
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}, (t) => [
  unique('saved_views_tenant_id_key').on(t.tenantId, t.id),
  // One name a shop, any case, among the views in use (a removed one keeps its name until it is restored or gone).
  uniqueIndex('saved_views_tenant_name').on(t.tenantId, sql`lower(${t.name})`).where(sql`${t.removedAt} is null`),
  check('saved_views_name', sql`length(${t.name}) between 1 and 40 and ${t.name} = btrim(${t.name})`),
  check('saved_views_query', sql`length(${t.query}) <= 400`),
  check('saved_views_tab', sql`${t.tab} in ('to_confirm','to_pack','to_ship','on_the_way','couldnt_deliver','coming_back','on_hold','all','not_paid')`),
])
