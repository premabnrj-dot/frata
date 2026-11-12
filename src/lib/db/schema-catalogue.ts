// =============================================================================
// FILE: src/lib/db/schema-catalogue.ts
//
// THE CATALOGUE TABLES (1A), split from schema.ts by responsibility. Same
// conventions as schema.ts; RLS and grants in drizzle/0012_catalogue_access.sql.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, money, tenants } from './schema'
import { videos } from './schema-themes'

// ── 1A Catalogue. Child rows carry (tenant_id, parent_id) → parent (tenant_id, id):
// a foreign key ignores RLS, so a plain one would let one shop point at another's
// product (tenancy audit 2026-11-06). RLS: drizzle/0012_catalogue_access.sql ──

/** A size chart: columns of measurements, one row per size, in cm (inches are derived for display). */
export type SizeChart = { columns: string[]; rows: { size: string; values: (number | null)[] }[]; howToMeasure: string }

/** A kind of product with its own size chart. Every product of the type follows the chart. */
export const productTypes = pgTable('product_types', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sizeChart: jsonb('size_chart').$type<SizeChart>().notNull(),
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('product_types_tenant_id_key').on(t.tenantId, t.id),
  uniqueIndex('product_types_tenant_name').on(t.tenantId, t.name),
  check('product_types_name', sql`length(${t.name}) between 1 and 60`),
])

/** A product. Hidden while published_at is null; archived, never deleted, once it has orders. */
export const products = pgTable('products', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  handle: text('handle').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  typeId: uuid('type_id'),
  /** Option names in order, e.g. {Size, Colour}; at most three. */
  options: text('options').array().notNull().default(sql`'{}'::text[]`),
  /** The values of each option, in the order shoppers see them: [["S","M"],["Indigo","Rust"]]. */
  optionValues: jsonb('option_values').$type<string[][]>().notNull().default(sql`'[]'::jsonb`),
  modelHeight: text('model_height').notNull().default(''),
  modelSize: text('model_size').notNull().default(''),
  originCountry: text('origin_country'),
  hsn: text('hsn'),
  /** The unit a piece is sold in on the invoice (GST UQC): NOS pieces, PRS pairs, SET, KGS, LTR, PAC… (tax/units.ts). */
  uqc: text('uqc').notNull().default('NOS'),
  /** The merchant's GST rate (bps) for an HSN the rate table lacks (tax/rates.ts), as their CA advises. Null: the table decides. */
  gstBps: integer('gst_bps'),
  /** What the pack says, shown on the product page (domains/catalogue/label.ts): net quantity, maker, best before, ingredients. */
  label: jsonb('label').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  /** Signal S3: up to 6 stories (photo, title, text, ≤ 3 numbered notes), validated by domains/catalogue/stories.ts
   *  (the real limit: characters); the CHECK below is a looser backstop in bytes. */
  stories: jsonb('stories').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  /** draft · active · unlisted · archived (PRODUCT_STATUSES). Who can find it; availability is per variant and derived. */
  status: text('status').notNull().default('draft'),
  /** Active but hidden until this moment (a scheduled drop). Null: live as soon as active. */
  publishAt: at('publish_at'),
  /** The first time it went live. From then on its handle is fixed (a change redirects). */
  publishedAt: at('published_at'),
  /** Shopify taxonomy category id (src/domains/catalogue/taxonomy/apparel.json), e.g. aa-1-23-7. */
  taxonomyCategory: text('taxonomy_category'),
  /** Empty = made from the templates in src/domains/seo/defaults.ts. */
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  archivedAt: at('archived_at'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('products_tenant_id_key').on(t.tenantId, t.id),
  uniqueIndex('products_tenant_handle').on(t.tenantId, t.handle),
  index('products_tenant_updated').on(t.tenantId, t.updatedAt),
  index('products_type').on(t.tenantId, t.typeId),
  foreignKey({ name: 'products_type_fk', columns: [t.tenantId, t.typeId], foreignColumns: [productTypes.tenantId, productTypes.id] }).onDelete('restrict'),
  check('products_options', sql`cardinality(${t.options}) <= 3`),
  // GST (plan 2026-11-09-gst-core-and-categories): an HSN is 4, 6 or 8 digits; the unit is a GST code; the merchant's own rate a GST 2.0 slab.
  check('products_hsn', sql`${t.hsn} is null or ${t.hsn} ~ '^[0-9]{4}([0-9]{2}){0,2}$'`),
  check('products_uqc', sql`${t.uqc} in ('NOS','PCS','PRS','SET','PAC','BOX','KGS','GMS','LTR','MLT','MTR')`),
  check('products_label', sql`jsonb_typeof(${t.label}) = 'object' and pg_column_size(${t.label}) < 8192`),
  check('products_gst_bps', sql`${t.gstBps} is null or ${t.gstBps} in (0, 300, 500, 1800, 4000)`),
  check('products_status', sql`${t.status} in ('draft','active','unlisted','archived')`),
  check('products_seo', sql`length(${t.seoTitle}) <= 200 and length(${t.seoDescription}) <= 400`),
  index('products_tenant_status').on(t.tenantId, t.status),
  check('products_handle', sql`${t.handle} ~ '^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$'`),
  check('products_title', sql`length(${t.title}) between 1 and 140`),
  check('products_stories', sql`jsonb_typeof(${t.stories}) = 'array' and jsonb_array_length(${t.stories}) <= 6 and octet_length(${t.stories}::text) < 16384`),
])

/** One size × colour (or the single variant of a product without options). */
export const variants = pgTable('variants', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  optionValues: text('option_values').array().notNull().default(sql`'{}'::text[]`),
  sku: text('sku'),
  /** The barcode (GTIN-8/12/13/14, check digit verified: catalogue/gtin.ts); optional (S2·3). MPN is the SKU. */
  gtin: text('gtin'),
  price: money('price').notNull(),
  compareAt: money('compare_at'),
  /** What it costs the merchant. Unknown is null, never 0. Read on the server only (ADR-0003). */
  unitCost: money('unit_cost'),
  stock: integer('stock').notNull().default(0),
  weightGrams: integer('weight_grams'),
  /** When stock reaches 0: stop · preorder · made_to_order (WHEN_OUT). What shoppers see is derived (catalogue/availability.ts). */
  whenOut: text('when_out').notNull().default('stop'),
  shipsBy: date('ships_by'),
  leadMinDays: integer('lead_min_days'),
  leadMaxDays: integer('lead_max_days'),
  /** Pre-orders allowed in total; null = no cap. */
  preorderCap: integer('preorder_cap'),
  position: integer('position').notNull().default(0),
  archivedAt: at('archived_at'),
  createdAt: createdAt(),
  /** When stock last went from > 0 to 0. Kept by the database (trigger app_variant_stock_times), never by the app. */
  soldOutAt: at('sold_out_at'),
  /** When a variant sold out for ≥ 24 h came back (stop-when-out only): Back in stock. Kept by the same trigger. */
  restockedAt: at('restocked_at'),
}, (t) => [
  unique('variants_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'variants_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  // tenant_id first: a unique check fires before the foreign key, so without it another shop could probe which sizes a product has (tenancy audit).
  uniqueIndex('variants_tenant_product_options').on(t.tenantId, t.productId, t.optionValues),
  check('variants_gtin', sql`${t.gtin} is null or ${t.gtin} ~ '^([0-9]{8}|[0-9]{12,14})$'`),
  uniqueIndex('variants_tenant_sku').on(t.tenantId, t.sku).where(sql`${t.sku} is not null`),
  // A SKU is one in the shop in any case, as the app compares them (writeProducts): two saves at once can't store
  // KS-1 and ks-1 (PI·1 · 5, found in PI·0).
  uniqueIndex('variants_tenant_sku_upper').on(t.tenantId, sql`upper(${t.sku})`).where(sql`${t.sku} is not null`),
  // One barcode names one size in a shop (Google refuses duplicates; impact review S2·3).
  uniqueIndex('variants_tenant_gtin').on(t.tenantId, t.gtin).where(sql`${t.gtin} is not null`),
  index('variants_tenant_product').on(t.tenantId, t.productId),
  check('variants_money', sql`${t.price} >= 0 and (${t.compareAt} is null or ${t.compareAt} >= 0) and (${t.unitCost} is null or ${t.unitCost} >= 0)`),
  check('variants_stock', sql`${t.stock} >= 0`),
  check('variants_when_out', sql`${t.whenOut} in ('stop','preorder','made_to_order')`),
  check('variants_preorder', sql`${t.whenOut} <> 'preorder' or ${t.shipsBy} is not null`),
  check('variants_lead', sql`${t.whenOut} <> 'made_to_order' or (${t.leadMinDays} between 1 and 120 and ${t.leadMaxDays} between ${t.leadMinDays} and 120)`),
  check('variants_cap', sql`${t.preorderCap} is null or ${t.preorderCap} >= 0`),
])

/** A photo, uploaded once in every size of the ladder (src/domains/media/sizes.ts). */
export const productImages = pgTable('product_images', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  /** Blob URL without the width suffix: `urlFor(base, w)` is each size (`${base}-${w}.webp`; a base ending `.jpg` is a JPEG photo, domains/media/sizes.ts). Always under tenants/<tenant_id>/. */
  base: text('base').notNull(),
  widths: integer('widths').array().notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  /** The option value this photo shows (a colour), or null for every variant. */
  optionValue: text('option_value'),
  alt: text('alt').notNull().default(''),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: 'product_images_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  index('product_images_product').on(t.tenantId, t.productId, t.position),
  // One row per uploaded photo: removing a photo deletes its files, so two rows must never share them.
  uniqueIndex('product_images_tenant_base').on(t.tenantId, t.base),
  unique('product_images_tenant_id_key').on(t.tenantId, t.id),
  check('product_images_dims', sql`${t.width} > 0 and ${t.height} > 0`),
])

export const PRODUCT_STATUSES = ['draft', 'active', 'unlisted', 'archived'] as const
export const WHEN_OUT = ['stop', 'preorder', 'made_to_order'] as const

/** A handle a product used to have: its old address redirects (308) to the current one. Never reused in the shop. */
export const productHandleHistory = pgTable('product_handle_history', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  handle: text('handle').notNull(),
  productId: uuid('product_id').notNull(),
  retiredAt: at('retired_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.handle] }),
  foreignKey({ name: 'product_handle_history_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  index('product_handle_history_product').on(t.tenantId, t.productId),
])

/** One colour of one product: the name shoppers read is the option value; this adds its family (filters, feeds) and its swatch. */
export const productColours = pgTable('product_colours', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  value: text('value').notNull(),
  /** A standard colour value id from the taxonomy (e.g. '2' = Blue). */
  family: text('family'),
  /** A plain swatch colour, as #rrggbb. */
  hex: text('hex'),
  /** Or a circle cut from one of the product's photos: centre and radius as fractions of the photo. */
  cropImageId: uuid('crop_image_id'),
  crop: jsonb('crop').$type<{ x: number; y: number; r: number }>(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.productId, t.value] }),
  foreignKey({ name: 'product_colours_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  // Same shop only (the action also limits it to this product's photos). ON DELETE SET NULL ("crop_image_id") in the
  // SQL (drizzle cannot say the column list): a plain SET NULL would null tenant_id too (tenancy audit 2026-11-06).
  foreignKey({ name: 'product_colours_image_fk', columns: [t.tenantId, t.cropImageId], foreignColumns: [productImages.tenantId, productImages.id] }).onDelete('set null'),
  check('product_colours_hex', sql`${t.hex} is null or ${t.hex} ~ '^#[0-9a-f]{6}$'`),
])

/** A product's details for one attribute (fabric, occasion…): standard value ids, or Frrata additions prefixed "frata:". */
export const productAttributes = pgTable('product_attributes', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  attribute: text('attribute').notNull(),
  values: text('values').array().notNull(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.productId, t.attribute] }),
  foreignKey({ name: 'product_attributes_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  check('product_attributes_values', sql`cardinality(${t.values}) between 1 and 20`),
])

export const COLLECTION_KINDS = ['manual', 'auto'] as const

/** The shop's own groups for menus and pages: hand-picked, or filled by rules (catalogue/collection-rules.ts). */
export const collections = pgTable('collections', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  handle: text('handle').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  kind: text('kind').notNull(),
  matchAll: integer('match_all').notNull().default(1),
  rules: jsonb('rules').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  sort: text('sort').notNull().default('newest'),
  /** Search and sharing (S2·2): empty uses the defaults (seo/defaults.ts). */
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('collections_tenant_id_key').on(t.tenantId, t.id),
  uniqueIndex('collections_tenant_handle').on(t.tenantId, t.handle),
  check('collections_kind', sql`${t.kind} in ('manual','auto')`),
  check('collections_sort', sql`${t.sort} in ('manual','newest','price_low','price_high','title')`),
  check('collections_title', sql`length(${t.title}) between 1 and 80`),
  check('collections_handle', sql`${t.handle} ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$'`),
  check('collections_seo', sql`length(${t.seoTitle}) <= 200 and length(${t.seoDescription}) <= 400`),
])

/** A collection's old addresses (S2·2): each redirects (308) to the collection. Append-only for the app. */
export const collectionHandleHistory = pgTable('collection_handle_history', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  handle: text('handle').notNull(),
  collectionId: uuid('collection_id').notNull(),
  retiredAt: at('retired_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.handle] }),
  foreignKey({ name: 'collection_handle_history_collection_fk', columns: [t.tenantId, t.collectionId], foreignColumns: [collections.tenantId, collections.id] }).onDelete('cascade'),
  index('collection_handle_history_collection').on(t.tenantId, t.collectionId),
])

export const collectionProducts = pgTable('collection_products', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  collectionId: uuid('collection_id').notNull(),
  productId: uuid('product_id').notNull(),
  position: integer('position').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.collectionId, t.productId] }),
  foreignKey({ name: 'collection_products_collection_fk', columns: [t.tenantId, t.collectionId], foreignColumns: [collections.tenantId, collections.id] }).onDelete('cascade'),
  foreignKey({ name: 'collection_products_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  index('collection_products_product').on(t.tenantId, t.productId),
])

/**
 * Signal S3 · "Pair it with": up to 2 pieces offered on a product's page. A table, not an id array, so the database
 * refuses another shop's product (composite FKs, like collection_products; tenancy review 2026-11-09). ≤ 2 per product
 * is the save's (products/actions via lib/catalogue/extras.ts); never itself (CHECK).
 */
/**
 * PV·1 (docs/plans/2026-11-10-product-video-pv1.md): a product's video, one per product. The video row (`videos`, use
 * 'product') holds the Mux asset and its state; this row says which product shows it, its cover frame and the button's
 * words beside the sizes. Same shop only (composite keys); a trigger refuses a video whose use isn't 'product'.
 */
export const productVideos = pgTable('product_videos', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  videoId: uuid('video_id').notNull(),
  /** The cover frame: Mux's still at this time (ms). */
  posterMs: integer('poster_ms').notNull().default(1000),
  /** The words beside the sizes: "See it on a model", "How to wear", or none. */
  button: text('button').notNull().default('model'),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.productId] }),
  unique('product_videos_video').on(t.tenantId, t.videoId),
  // No cascade: a product can't silently drop its video (its Mux asset would stay); the action unlinks through removeVideo.
  foreignKey({ name: 'product_videos_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }),
  foreignKey({ name: 'product_videos_video_fk', columns: [t.tenantId, t.videoId], foreignColumns: [videos.tenantId, videos.id] }),
  check('product_videos_poster', sql`${t.posterMs} between 0 and 60000`),
  check('product_videos_button', sql`${t.button} in ('model', 'wear', 'none')`),
])

export const productPairs = pgTable('product_pairs', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  pairedId: uuid('paired_id').notNull(),
  position: integer('position').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.productId, t.pairedId] }),
  foreignKey({ name: 'product_pairs_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  foreignKey({ name: 'product_pairs_paired_fk', columns: [t.tenantId, t.pairedId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  check('product_pairs_not_self', sql`${t.productId} <> ${t.pairedId}`),
  check('product_pairs_position', sql`${t.position} between 0 and 1`),
])

