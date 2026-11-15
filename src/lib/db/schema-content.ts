// =============================================================================
// FILE: src/lib/db/schema-content.ts — A STORE'S CONTENT (V1, plan docs/plans/2026-11-15-v1-content.md; spec
// docs/specs/2026-11-14-site-content-layer.md; ADR-0014 amendment 8). One row per fact: an announcement bar (≤ 3,
// dated), a menu (main, footer, phone tabs), the Contact line. A save is live; `previous` keeps the entry before the
// last save (Undo and forensics), `version` refuses a stale save. The schedule is in the columns (`starts_at`,
// `ends_at`, `stopped_at`: state derived by src/domains/content/schedule.ts), never inside `value`. A deleted bar keeps
// its row for Undo (`deleted_at`) until the next bar is added. Access: drizzle/0133_site_content_access.sql
// (frata_app: select, insert, delete and the content columns only; no frata_admin; RLS; a per-store cap trigger).
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from './schema'
import { CONTENT_KINDS } from '@/domains/content/kinds'
import { sqlList } from '@/domains/tenancy/roles'

export const siteContent = pgTable('site_content', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  /** The entry before the last save: { value, startsAt, endsAt, stoppedAt, deletedAt }. Undo reads it once. */
  previous: jsonb('previous'),
  startsAt: at('starts_at'),
  endsAt: at('ends_at'),
  /** Ended early by a person ("End now"). */
  stoppedAt: at('stopped_at'),
  deletedAt: at('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  /** The person who saved it last; null while it is as the move copied it (the move's re-run may still refresh it). */
  updatedBy: uuid('updated_by'),
}, (t) => [
  unique('site_content_tenant_id').on(t.tenantId, t.id),
  unique('site_content_tenant_kind_key').on(t.tenantId, t.kind, t.key),
  check('site_content_kind', sql`${t.kind} in (${sql.raw(sqlList(CONTENT_KINDS))})`),
  check('site_content_key', sql`${t.key} ~ '^[a-z0-9.-]{1,40}$'`),
  check('site_content_menu_key', sql`${t.kind} <> 'menu' or ${t.key} in ('main','footer','tabs')`),
  check('site_content_contact_key', sql`${t.kind} <> 'contact' or ${t.key} = 'contact'`),
  check('site_content_dated', sql`${t.kind} = 'announcement' or (${t.startsAt} is null and ${t.endsAt} is null and ${t.stoppedAt} is null and ${t.deletedAt} is null)`),
  check('site_content_ends', sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  check('site_content_value_size', sql`octet_length(${t.value}::text) <= 32768`),
  check('site_content_previous_size', sql`${t.previous} is null or octet_length(${t.previous}::text) <= 34816`),
])
