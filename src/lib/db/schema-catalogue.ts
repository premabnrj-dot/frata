// =============================================================================
// FILE: src/lib/db/schema-catalogue.ts
//
// THE CATALOGUE TABLES (1A), split from schema.ts by responsibility. Same
// conventions as schema.ts; RLS and grants in drizzle/0012_catalogue_access.sql.
// =============================================================================

import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, money, tenants } from './schema'

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
  publishedAt: at('published_at'),
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
  check('products_handle', sql`${t.handle} ~ '^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$'`),
  check('products_title', sql`length(${t.title}) between 1 and 140`),
])

/** One size × colour (or the single variant of a product without options). */
export const variants = pgTable('variants', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  optionValues: text('option_values').array().notNull().default(sql`'{}'::text[]`),
  sku: text('sku'),
  price: money('price').notNull(),
  compareAt: money('compare_at'),
  /** What it costs the merchant. Unknown is null, never 0. Read on the server only (ADR-0003). */
  unitCost: money('unit_cost'),
  stock: integer('stock').notNull().default(0),
  weightGrams: integer('weight_grams'),
  position: integer('position').notNull().default(0),
  archivedAt: at('archived_at'),
  createdAt: createdAt(),
}, (t) => [
  unique('variants_tenant_id_key').on(t.tenantId, t.id),
  foreignKey({ name: 'variants_product_fk', columns: [t.tenantId, t.productId], foreignColumns: [products.tenantId, products.id] }).onDelete('cascade'),
  uniqueIndex('variants_product_options').on(t.productId, t.optionValues),
  uniqueIndex('variants_tenant_sku').on(t.tenantId, t.sku).where(sql`${t.sku} is not null`),
  index('variants_tenant_product').on(t.tenantId, t.productId),
  check('variants_money', sql`${t.price} >= 0 and (${t.compareAt} is null or ${t.compareAt} >= 0) and (${t.unitCost} is null or ${t.unitCost} >= 0)`),
  check('variants_stock', sql`${t.stock} >= 0`),
])

/** A photo, uploaded once in every size of the ladder (src/domains/media/sizes.ts). */
export const productImages = pgTable('product_images', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  /** Blob URL without the width suffix: `${base}-${w}.webp` is each size. Always under tenants/<tenant_id>/. */
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
  check('product_images_dims', sql`${t.width} > 0 and ${t.height} > 0`),
])
