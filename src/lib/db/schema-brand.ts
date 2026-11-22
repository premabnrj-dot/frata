// =============================================================================
// FILE: src/lib/db/schema-brand.ts — A CODE-SITE STORE'S BRAND RECORD (one-address plan P1·2; spec
// docs/specs/2026-11-16-one-address-checkout.md § 5). One `brand_tokens` row a store: the optional logo files (the main
// logo stays `shop_settings.logo_url`), eleven colour roles, two fonts, corners and spacing, all typed columns. `previous`
// keeps the record before the last save (Undo, once). `brand_proposals`: a partner's change on an open store, waiting for
// the owner's yes or no (O17), one open a store, its outcome kept for the Notices row. `brand_seasons`: an accent for a
// stretch of days. Written only by saveBrand
// (src/lib/content/save.ts, P1·3). Access: drizzle/0155_brand_record.sql (frata_app; frata_builder named columns; no frata_admin).
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, smallint, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from './schema'
import { brandFileCheck } from './brand-file-check'
import { DENSITIES, FONTS, RADII } from '@/domains/brand/record'
import { HEADERS, HEADING_MAX, MAX_TRUST, POLICY_ROWS, THANKS_MAX, TRUST_KEYS } from '@/domains/brand/checkout'
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
/** What a waiting change is to (one-address P2·1): the brand record, or the checkout design. One open of each a store. */
export const PROPOSAL_KINDS = ['brand', 'checkout'] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

export const brandProposals = pgTable('brand_proposals', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  /** brand: `record` is a brand record; checkout: a checkout design (one-address P2·1). */
  kind: text('kind').notNull().default('brand'),
  /** The whole record the change would make live, in saveBrand's shape (main logo included), or the whole design. */
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
  uniqueIndex('brand_proposals_one_open').on(t.tenantId, t.kind).where(sql`${t.decidedAt} is null`),
  check('brand_proposals_kind', sql`${t.kind} in (${sql.raw(sqlList(PROPOSAL_KINDS))})`),
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
  // The boundary sweep (app_shops_with_boundary) looks for any season starting or ending in a window, across stores.
  index('brand_seasons_starts').on(t.startsAt),
  index('brand_seasons_ends').on(t.endsAt),
  check('brand_seasons_name', sql`char_length(${t.name}) between 1 and 40`),
  check('brand_seasons_ends', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  check('brand_seasons_colours', sql`${HEX(t.colorAccent)} and ${HEX(t.colorOn)}`),
])

/**
 * A code-site store's checkout design (one-address plan P2·1; spec § 3; owner decisions 12–14): one row a store, what a
 * partner may set on checkout, the bag-link page, order pages and policies, and nothing more. Its rules live in
 * src/domains/brand/checkout.ts; the CHECKs below hold the closed sets and the lines' lengths (the money rules are the
 * domain's, run on save and again at render). `previous` keeps the design before the last save (Undo, once). Written
 * only by saveCheckout, undoCheckout and decideBrand (src/lib/content/save.ts). Access: drizzle/0156 (frata_app; frata_builder named columns).
 */
export const checkoutDesign = pgTable('checkout_design', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  header: text('header').notNull().default('left'),
  backLink: boolean('back_link').notNull().default(true),
  policyRows: smallint('policy_rows').notNull().default(1),
  /** On, in the partner's order. */
  trust: text('trust').array().notNull().default(sql`array['delivery','returns','cod','secure']::text[]`),
  heading: text('heading').notNull().default(''),
  thanks: text('thanks').notNull().default(''),
  previous: jsonb('previous'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
}, (t) => [
  unique('checkout_design_tenant').on(t.tenantId),
  check('checkout_design_header', sql`${t.header} in (${sql.raw(sqlList(HEADERS))})`),
  check('checkout_design_rows', sql`${t.policyRows} in (${sql.raw(POLICY_ROWS.join(','))})`),
  check('checkout_design_trust', sql`cardinality(${t.trust}) <= ${sql.raw(String(MAX_TRUST))} and ${t.trust} <@ array[${sql.raw(sqlList(TRUST_KEYS))}]::text[] and array_position(${t.trust}, null) is null`),
  check('checkout_design_lines', sql`char_length(${t.heading}) <= ${sql.raw(String(HEADING_MAX))} and char_length(${t.thanks}) <= ${sql.raw(String(THANKS_MAX))}`),
  check('checkout_design_previous_size', sql`${t.previous} is null or octet_length(${t.previous}::text) <= 4096`),
])
