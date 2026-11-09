// =============================================================================
// FILE: src/lib/db/schema-themes.ts — a shop's looks (docs/specs/2026-11-08-themes.md § Data, plan § Review findings).
// Access: drizzle/0034_themes_access.sql. Revisions are content (the merchant's layer, re-parsed at every read);
// which look is LIVE is derived: the latest publish row. The open draft is the newest revision with no publish row
// (at most one: src/lib/themes/look.ts replaces it under a per-shop lock). Nothing here stores a status.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core'
import { at, id, tenants } from './schema'

export const THEME_KEYS = ['classic', 'editorial', 'bazaar', 'minimal', 'atelier', 'signal'] as const

export const shopThemeRevisions = pgTable('shop_theme_revisions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  themeKey: text('theme_key').notNull(),
  themeVersion: text('theme_version').notNull(),
  styleKey: text('style_key').notNull(),
  /** The merchant's layer: { settings?, home?, site?, menus? } (site and menus: Look v4). Content, parsed by the theme's schemas at every save and read. */
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
  check('shop_theme_revisions_key', sql`${t.themeKey} in ('classic','editorial','bazaar','minimal','atelier','signal')`),
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

/**
 * A theme version Admin has decided about (themes T3). Platform data: no tenant. The code is the manifest; this row
 * holds only when Admin released, recalled or withdrew it (state is derived from these, never stored). Shops read
 * id, key, version and the three dates (column grants); never who or why. Recall and withdraw are final.
 */
export const themeVersions = pgTable('theme_versions', {
  id: id(),
  themeKey: text('theme_key').notNull(),
  version: text('version').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
  releasedAt: at('released_at'), releasedBy: uuid('released_by'),
  recalledAt: at('recalled_at'), recalledBy: uuid('recalled_by'), recalledReason: text('recalled_reason'),
  withdrawnAt: at('withdrawn_at'), withdrawnBy: uuid('withdrawn_by'), withdrawnReason: text('withdrawn_reason'),
}, (t) => [
  unique('theme_versions_key_version').on(t.themeKey, t.version),
  check('theme_versions_version_shape', sql`${t.version} ~ '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'`),
  // Classic 1.0.0 is every shop's fallback look (baselineRevision): it can never be pulled.
  check('theme_versions_baseline_stays', sql`not (${t.themeKey} = 'classic' and ${t.version} = '1.0.0' and (${t.recalledAt} is not null or ${t.withdrawnAt} is not null))`),
  check('theme_versions_reasons', sql`(${t.recalledAt} is null or length(${t.recalledReason}) between 3 and 300) and (${t.withdrawnAt} is null or length(${t.withdrawnReason}) between 3 and 300)`),
])

/** A version offered to one shop before everyone (a pilot). The shop reads its own rows; Admin stages and unstages. */
export const themeVersionStages = pgTable('theme_version_stages', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').notNull().references(() => themeVersions.id, { onDelete: 'cascade' }),
  stagedAt: at('staged_at').notNull().defaultNow(),
  stagedBy: uuid('staged_by').notNull(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.versionId], name: 'theme_version_stages_pk' }),
  index('theme_version_stages_version').on(t.versionId),
])

/**
 * A shop's videos (V1, docs/plans/2026-11-09-video-v1.md; access drizzle/0081). Hosted on Mux; the row is written
 * BEFORE the upload is created (ADR-0008) and its state is derived from the timestamps (src/domains/video/state.ts):
 * pending → ready (asset) → playable (MP4 rendition); errored; removed. Never deleted by the app: the per-day and
 * per-month upload caps count every row. `mux_env` is the Mux environment the row was made in; an event or a
 * delete from another environment is refused (previews share this database).
 */
export const videos = pgTable('videos', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  muxEnv: text('mux_env').notNull(),
  uploadId: text('upload_id').unique(),
  assetId: text('asset_id').unique(),
  playbackId: text('playback_id'),
  durationMs: integer('duration_ms'),
  width: integer('width'),
  height: integer('height'),
  createdAt: at('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  readyAt: at('ready_at'),
  mp4ReadyAt: at('mp4_ready_at'),
  erroredAt: at('errored_at'),
  /** Our word or Mux's code (too_long, upload_errored, asset_errored, cancelled), ≤ 40. */
  error: text('error'),
  removedAt: at('removed_at'),
}, (t) => [
  index('videos_shop').on(t.tenantId, t.createdAt),
  check('videos_env', sql`${t.muxEnv} ~ '^[A-Za-z0-9_-]{1,40}$'`),
  check('videos_ids', sql`(${t.uploadId} is null or ${t.uploadId} ~ '^[A-Za-z0-9]{1,128}$') and (${t.assetId} is null or ${t.assetId} ~ '^[A-Za-z0-9]{1,128}$') and (${t.playbackId} is null or ${t.playbackId} ~ '^[A-Za-z0-9]{1,64}$')`),
  check('videos_error', sql`(${t.erroredAt} is null) = (${t.error} is null) and (${t.error} is null or length(${t.error}) <= 40)`),
  check('videos_size', sql`(${t.width} is null or ${t.width} between 1 and 8192) and (${t.height} is null or ${t.height} between 1 and 8192) and (${t.durationMs} is null or ${t.durationMs} between 0 and 43200000)`),
  check('videos_playable', sql`${t.mp4ReadyAt} is null or (${t.readyAt} is not null and ${t.playbackId} is not null)`),
])
