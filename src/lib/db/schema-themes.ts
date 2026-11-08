// =============================================================================
// FILE: src/lib/db/schema-themes.ts — a shop's looks (docs/specs/2026-11-08-themes.md § Data, plan § Review findings).
// Access: drizzle/0034_themes_access.sql. Revisions are content (the merchant's layer, re-parsed at every read);
// which look is LIVE is derived: the latest publish row. The open draft is the newest revision with no publish row
// (at most one: src/lib/themes/look.ts replaces it under a per-shop lock). Nothing here stores a status.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { at, id, tenants } from './schema'

export const THEME_KEYS = ['classic', 'editorial', 'bazaar', 'minimal', 'atelier'] as const

export const shopThemeRevisions = pgTable('shop_theme_revisions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  themeKey: text('theme_key').notNull(),
  themeVersion: text('theme_version').notNull(),
  styleKey: text('style_key').notNull(),
  /** The merchant's layer: { settings?, home? }. Content, parsed by the theme's schemas at every save and read. */
  settings: jsonb('settings').notNull(),
  /** Optimistic lock: bumped by every save; a save or publish naming an older one is refused. */
  version: integer('version').notNull().default(1),
  createdAt: at('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  createdByEmail: text('created_by_email'),
  updatedAt: at('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').notNull(),
  updatedByEmail: text('updated_by_email'),
}, (t) => [
  unique('shop_theme_revisions_tenant_id').on(t.tenantId, t.id),
  index('shop_theme_revisions_recent').on(t.tenantId, t.createdAt),
  check('shop_theme_revisions_key', sql`${t.themeKey} in ('classic','editorial','bazaar','minimal','atelier')`),
  check('shop_theme_revisions_version_shape', sql`${t.themeVersion} ~ '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'`),
  check('shop_theme_revisions_style_shape', sql`${t.styleKey} ~ '^[a-z0-9-]{1,40}$'`),
  check('shop_theme_revisions_size', sql`octet_length(${t.settings}::text) <= 65536`),
])

/** Append-only: the live look is the latest row (by published_at, then id). */
export const shopThemePublishes = pgTable('shop_theme_publishes', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  revisionId: uuid('revision_id').notNull(),
  publishedAt: at('published_at').notNull().defaultNow(),
  publishedBy: uuid('published_by').notNull(),
  publishedByEmail: text('published_by_email'),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.revisionId], foreignColumns: [shopThemeRevisions.tenantId, shopThemeRevisions.id], name: 'shop_theme_publishes_revision' }).onDelete('no action'), // checked at statement end, so deleting a shop cascades; the trigger refuses deleting a published revision
  index('shop_theme_publishes_latest').on(t.tenantId, t.publishedAt, t.id),
  index('shop_theme_publishes_revision_idx').on(t.tenantId, t.revisionId),
])
