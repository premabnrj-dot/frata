// =============================================================================
// FILE: src/lib/db/schema-brand.ts — A CODE-SITE STORE'S BRAND RECORD (one-address plan P1·2; spec
// docs/specs/2026-11-16-one-address-checkout.md § 5). One `brand_tokens` row a store: the optional logo files (the main
// logo stays `shop_settings.logo_url`), eleven colour roles, two fonts, corners and spacing, all typed columns. `previous`
// keeps the record before the last save (Undo, once). `brand_proposals`: a partner's change on an open store, waiting for
// the owner's yes or no (O17), one open a store, its outcome kept for the Notices row. `brand_seasons`: an accent for a
// stretch of days. Written only by saveBrand
// (src/lib/content/save.ts, P1·3). Access: drizzle/0152_brand_record.sql (frata_app; frata_builder named columns; no frata_admin).
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, smallint, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from './schema'
import { brandFileCheck } from './brand-file-check'
import { DENSITIES, FONTS, RADII } from '@/domains/brand/record'
import { sqlList } from '@/domains/tenancy/roles'

const HEX = (c: unknown) => sql`${c} ~ '^#[0-9A-F]{6}$'`

export const brandTokens = pgTable('brand_tokens', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  logoMarkUrl: text('logo_mark_url'),
  logoStackedUrl: text('logo_stacked_url'),
  logoReversedUrl: text('logo_reversed_url'),
  colorBg: text('color_bg').notNull(),
  colorPanel: text('color_panel').notNull(),
  colorText: text('color_text').notNull(),
  colorMuted: text('color_muted').notNull(),
  colorAccent: text('color_accent').notNull(),
  colorOn: text('color_on').notNull(),
  colorEdge: text('color_edge').notNull(),
  colorLine: text('color_line').notNull(),
  colorGood: text('color_good').notNull(),
  colorWarn: text('color_warn').notNull(),
  colorBad: text('color_bad').notNull(),
  fontDisplay: text('font_display').notNull(),
  fontBody: text('font_body').notNull(),
  radius: smallint('radius').notNull(),
  density: text('density').notNull(),
  /** The record (and main logo) before the last save, for Undo: the same shape saveBrand writes. Never read by a shopper. */
  previous: jsonb('previous'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
}, (t) => [
  unique('brand_tokens_tenant').on(t.tenantId),
  check('brand_tokens_mark', brandFileCheck(t.logoMarkUrl, t.tenantId)),
  check('brand_tokens_stacked', brandFileCheck(t.logoStackedUrl, t.tenantId)),
  check('brand_tokens_reversed', brandFileCheck(t.logoReversedUrl, t.tenantId)),
  check('brand_tokens_colours', sql`${HEX(t.colorBg)} and ${HEX(t.colorPanel)} and ${HEX(t.colorText)} and ${HEX(t.colorMuted)} and ${HEX(t.colorAccent)} and ${HEX(t.colorOn)} and ${HEX(t.colorEdge)} and ${HEX(t.colorLine)} and ${HEX(t.colorGood)} and ${HEX(t.colorWarn)} and ${HEX(t.colorBad)}`),
  check('brand_tokens_fonts', sql`${t.fontDisplay} in (${sql.raw(sqlList(FONTS))}) and ${t.fontBody} in (${sql.raw(sqlList(FONTS))})`),
  check('brand_tokens_radius', sql`${t.radius} in (${sql.raw(RADII.join(','))})`),
  check('brand_tokens_density', sql`${t.density} in (${sql.raw(sqlList(DENSITIES))})`),
  check('brand_tokens_previous_size', sql`${t.previous} is null or octet_length(${t.previous}::text) <= 8192`),
])

export const PROPOSAL_DECISIONS = ['approved', 'declined', 'replaced'] as const

export const brandProposals = pgTable('brand_proposals', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  /** The whole record the change would make live, in saveBrand's shape (main logo included). */
  record: jsonb('record').notNull(),
  /** "4 logo files and 2 fonts." (changeSummary at the time it was sent): the Notices row's line. */
  summary: text('summary').notNull(),
  /** The live record's version it was made against: Approve refuses if the record moved since. */
  baseVersion: integer('base_version').notNull(),
  proposedBy: uuid('proposed_by').notNull(),
  proposedAt: at('proposed_at').notNull().defaultNow(),
  decidedAt: at('decided_at'),
  /** approved (live), declined (dropped), replaced (a newer save took its place). */
  decision: text('decision'),
  decidedBy: uuid('decided_by'),
}, (t) => [
  unique('brand_proposals_tenant_id').on(t.tenantId, t.id),
  uniqueIndex('brand_proposals_one_open').on(t.tenantId).where(sql`${t.decidedAt} is null`),
  check('brand_proposals_record_size', sql`octet_length(${t.record}::text) <= 8192`),
  check('brand_proposals_summary', sql`char_length(${t.summary}) between 1 and 120`),
  check('brand_proposals_decision', sql`(${t.decidedAt} is null) = (${t.decision} is null) and (${t.decision} is null or ${t.decision} in (${sql.raw(sqlList(PROPOSAL_DECISIONS))}))`),
])

export const brandSeasons = pgTable('brand_seasons', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startsAt: at('starts_at').notNull(),
  /** Null: until someone ends it. A season stops by itself at this time. */
  endsAt: at('ends_at'),
  colorAccent: text('color_accent').notNull(),
  colorOn: text('color_on').notNull(),
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
}, (t) => [
  unique('brand_seasons_tenant_id').on(t.tenantId, t.id),
  index('brand_seasons_tenant_starts').on(t.tenantId, t.startsAt),
  check('brand_seasons_name', sql`char_length(${t.name}) between 1 and 40`),
  check('brand_seasons_ends', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  check('brand_seasons_colours', sql`${HEX(t.colorAccent)} and ${HEX(t.colorOn)}`),
])
