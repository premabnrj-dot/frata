import 'server-only'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { CleanVariant } from '@/domains/catalogue/product-form'
import { combinations, handleFor, keyOf, reconcile, skuFor, uniqueSku, type Option } from '@/domains/catalogue/variants'
import { orderPrefix } from '@/domains/signup/slug'
import type { Tx } from '@/lib/db'
import { shopSettings, tenants } from '@/lib/db/schema'
import { products, variants } from '@/lib/db/schema-catalogue'
import { freeHandles, undigit } from './handles'
import { retireVariants } from './retire-variants'

// =============================================================================
// FILE: src/lib/catalogue/write.ts
//
// THE ONE WRITER OF A PRODUCT'S VARIANTS (plan 2026-11-12-product-import PI·0): the editor's save (one product) and the
// import's chunks (many) both come here, inside the caller's tenant transaction. Set-based: whatever the count, one
// read of handles, one of SKUs, one of barcodes, one insert per table, one update of kept sizes.
//
// Rules, the editor's as they were:
// - An existing product's variants are locked first, in id order (as checkout locks them: no deadlock), and the
//   writer waits at most 1 s for a lock; the caller's lock_timeout is put back after.
// - A size or colour still wanted keeps its row; one dropped is archived if ever ordered, deleted if not, refused with
//   pre-orders to pack (retire-variants.ts); one added back that was archived returns as the same row.
// - A SKU is unique in the shop in any case. A typed one on another product is refused; a blank one is made from the
//   shop prefix and the handle (skuFor), then "-2", "-3"… (uniqueSku). Once saved it is sent back and kept.
// - A barcode names one size in the shop.
// - The cost of goods is written only when the member sees costs (`costs`); otherwise a stored cost stays as it was
//   and a new size has none.
// - An existing product's own row is the caller's (saveProduct updates it under its version check). A new product
//   gets a free handle (handles.ts freeHandles) and the rest of its row from `row`.
// - A refusal is returned before anything is written.
// =============================================================================

type NewRow = Omit<typeof products.$inferInsert, 'id' | 'tenantId' | 'handle' | 'title' | 'options' | 'optionValues' | 'version'>
export type ProductDraft = {
  /** One of this shop's products: its variants are reconciled to `options`. Absent: a new product is inserted. */
  productId?: string
  /** An existing product's handle (its default SKUs come from it); for a new one the wanted handle, '' for its title's. */
  handle: string
  title: string
  options: Option[]
  /** One per combination of `options` (cleanProduct's), matched by their values. */
  variants: CleanVariant[]
  /** A new product's other columns (the column defaults otherwise: a draft). */
  row?: NewRow
}
export type Written = { ok: true; products: { id: string; handle: string }[] } | { ok: false; draft: number; error: string }

/** Strings as ONE Postgres array parameter, quoted, so a read is one statement whatever the count. */
const list = (xs: readonly string[], type: 'text' | 'uuid') =>
  sql`${`{${xs.map((x) => `"${x.replace(/["\\]/g, '\\$&')}"`).join(',')}}`}::${sql.raw(type)}[]`

/**
 * SKUs on OTHER products (upper case, as compared) whose form without trailing digits is one of `keys` (undigit of
 * each wanted SKU, and a stem + "-" for its "-N" forms): a superset of the clashes, each a real taken SKU. One rtrim
 * per row, no regex (the 10× read: write.int.test.ts, SPEED=1).
 */
export const takenSkus = (tx: Tx, tenantId: string, own: string[], keys: string[]) =>
  tx.select({ sku: sql<string>`upper(${variants.sku})` }).from(variants).where(and(
    eq(variants.tenantId, tenantId), sql`${variants.sku} is not null`, sql`${variants.productId} <> all(${list(own, 'uuid')})`,
    sql`upper(rtrim(${variants.sku}, '0123456789')) = any(${list(keys, 'text')})`,
  ))

export async function writeProducts(tx: Tx, tenantId: string, drafts: readonly ProductDraft[], opts: { costs: boolean }): Promise<Written> {
  if (!drafts.length) return { ok: true, products: [] }
  const [was] = await tx.execute<{ prev: string }>(sql`select current_setting('lock_timeout') as prev, set_config('lock_timeout', '1s', true)`)
  const result = await write(tx, tenantId, drafts, opts)
  await tx.execute(sql`select set_config('lock_timeout', ${was!.prev}, true)`)
  return result
}

async function write(tx: Tx, tenantId: string, drafts: readonly ProductDraft[], { costs }: { costs: boolean }): Promise<Written> {
  const fail = (draft: number, error: string): Written => ({ ok: false, draft, error })
  const own = drafts.flatMap((d) => (d.productId ? [d.productId] : []))
  const ownList = list(own, 'uuid')

  // Existing products' variants, live and archived, locked in id order: from here no order line can land on them.
  const locked = own.length ? await tx.select({ id: variants.id, productId: variants.productId, optionValues: variants.optionValues, archivedAt: variants.archivedAt })
    .from(variants).where(and(eq(variants.tenantId, tenantId), sql`${variants.productId} = any(${ownList})`)).orderBy(asc(variants.id)).for('update') : []
  const plans = drafts.map((d) => {
    const mine = d.productId ? locked.filter((v) => v.productId === d.productId) : []
    return { ...reconcile(mine.filter((v) => !v.archivedAt), d.options), archived: mine.filter((v) => v.archivedAt) }
  })

  // New products' addresses.
  const fresh = drafts.flatMap((d, i) => (d.productId ? [] : [i]))
  const handles = [...drafts.map((d) => d.handle)]
  const free = await freeHandles(tx, tenantId, fresh.map((i) => handleFor(drafts[i]!.handle || drafts[i]!.title) || 'product'))
  fresh.forEach((i, k) => { handles[i] = free[k]! })

  // Barcodes: one size each, in the batch and in the shop.
  const gtinAt = new Map<string, number>()
  for (const [i, d] of drafts.entries()) for (const v of d.variants) {
    if (!v.gtin) continue
    if ((gtinAt.get(v.gtin) ?? i) !== i) return fail(i, `Barcode ${v.gtin} is on two of these products.`)
    gtinAt.set(v.gtin, i)
  }
  if (gtinAt.size) {
    const [clash] = await tx.select({ gtin: variants.gtin }).from(variants)
      .where(and(eq(variants.tenantId, tenantId), sql`${variants.productId} <> all(${ownList})`, sql`${variants.gtin} = any(${list([...gtinAt.keys()], 'text')})`)).limit(1)
    if (clash) return fail(gtinAt.get(clash.gtin!)!, `Barcode ${clash.gtin} is already on another product in your shop.`)
  }

  // SKUs: typed ones checked, blank ones made, all unique in the shop in any case.
  const typedAt = new Map<string, number>()
  for (const [i, d] of drafts.entries()) for (const v of d.variants) {
    if (!v.sku) continue
    if ((typedAt.get(v.sku.toUpperCase()) ?? i) !== i) return fail(i, `SKU ${v.sku} is on two of these products.`)
    typedAt.set(v.sku.toUpperCase(), i)
  }
  const prefix = drafts.some((d) => d.variants.some((v) => !v.sku)) ? await shopPrefix(tx, tenantId) : ''
  const bases = drafts.map((d, i) => d.variants.map((v) => (v.sku ? null : skuFor(prefix, handles[i]!, v.values))))
  const made = bases.flat().filter((b): b is string => b !== null)
  const keys = [...new Set([...typedAt.keys(), ...made.map((b) => b.toUpperCase())].map(undigit).concat(made.map((b) => `${b.slice(0, 32).toUpperCase()}-`)))]
  const others = new Set(keys.length ? (await takenSkus(tx, tenantId, own, keys)).map((r) => r.sku) : [])
  for (const [i, d] of drafts.entries()) for (const v of d.variants) {
    if (v.sku && others.has(v.sku.toUpperCase())) return fail(i, `SKU ${v.sku} is already used by another product in your shop.`)
  }
  const taken = new Set([...others, ...typedAt.keys()])
  const skus = drafts.map((d, i) => d.variants.map((v, j) => {
    if (v.sku) return v.sku
    const s = uniqueSku(bases[i]![j]!, taken)
    taken.add(s.toUpperCase())
    return s
  }))

  // Removed sizes and colours (refused before it writes, with pre-orders to pack).
  const retired = await retireVariants(tx, tenantId, plans.flatMap((p) => p.remove.map((v) => v.id)))
  if (!retired.ok) return fail(Math.max(0, plans.findIndex((p) => p.remove.length)), retired.error)

  // New products: one insert.
  const inserted = fresh.length ? await tx.insert(products).values(fresh.map((i) => ({
    ...drafts[i]!.row, tenantId, title: drafts[i]!.title, handle: handles[i]!, options: drafts[i]!.options.map((o) => o.name), optionValues: drafts[i]!.options.map((o) => o.values),
  }))).returning({ id: products.id, handle: products.handle }) : []
  const ids = drafts.map((d, i) => d.productId ?? inserted.find((p) => p.handle === handles[i])!.id)

  // Every variant's row: kept or brought back (one update), or new (one insert).
  type Row = { values: string[]; v: CleanVariant; sku: string; position: number }
  const update: (Row & { id: string })[] = [], insert: (Row & { productId: string })[] = []
  for (const [i, d] of drafts.entries()) {
    const byKey = new Map(d.variants.map((v, j) => [keyOf(v.values), j]))
    const plan = plans[i]!
    for (const [position, values] of combinations(d.options).entries()) {
      const j = byKey.get(keyOf(values))
      if (j === undefined) throw new Error('writeProducts: a combination has no variant')
      const row = { values, v: d.variants[j]!, sku: skus[i]![j]!, position }
      const same = plan.keep.find((k) => keyOf(k.optionValues) === keyOf(values)) ?? plan.archived.find((a) => keyOf(a.optionValues) === keyOf(values))
      if (same) update.push({ ...row, id: same.id })
      else insert.push({ ...row, productId: ids[i]! })
    }
  }
  // SKUs and barcodes cleared first, so two sizes can swap theirs in one save.
  if (own.length) await tx.update(variants).set({ sku: null, gtin: null }).where(and(eq(variants.tenantId, tenantId), sql`${variants.productId} = any(${ownList})`))
  if (update.length) await tx.execute(sql`
    update variants as v set price = x.price, compare_at = x.compare_at, ${costs ? sql`unit_cost = x.unit_cost,` : sql``} stock = x.stock, sku = x.sku,
      gtin = x.gtin, position = x.position, when_out = x.when_out, ships_by = x.ships_by, lead_min_days = x.lead_min, lead_max_days = x.lead_max,
      preorder_cap = x.cap, archived_at = null
    from (values ${sql.join(update.map((r) => sql`(${r.id}::uuid, ${r.v.price}::bigint, ${r.v.compareAt}::bigint, ${r.v.unitCost}::bigint, ${r.v.stock}::int,
      ${r.sku}::text, ${r.v.gtin}::text, ${r.position}::int, ${r.v.whenOut}::text, ${r.v.shipsBy}::date, ${r.v.leadMinDays}::int, ${r.v.leadMaxDays}::int,
      ${r.v.preorderCap}::int)`), sql`, `)}) as x(id, price, compare_at, unit_cost, stock, sku, gtin, position, when_out, ships_by, lead_min, lead_max, cap)
    where v.tenant_id = ${tenantId} and v.id = x.id`)
  if (insert.length) await tx.insert(variants).values(insert.map((r) => ({
    tenantId, productId: r.productId, optionValues: r.values, price: r.v.price, compareAt: r.v.compareAt, ...(costs ? { unitCost: r.v.unitCost } : {}),
    stock: r.v.stock, sku: r.sku, gtin: r.v.gtin, position: r.position, whenOut: r.v.whenOut, shipsBy: r.v.shipsBy,
    leadMinDays: r.v.leadMinDays, leadMaxDays: r.v.leadMaxDays, preorderCap: r.v.preorderCap,
  })))
  return { ok: true, products: drafts.map((_, i) => ({ id: ids[i]!, handle: handles[i]! })) }
}

/** The shop's SKU prefix: its order prefix, else two letters of its name (orderPrefix). */
async function shopPrefix(tx: Tx, tenantId: string) {
  const [shop] = await tx.select({ prefix: shopSettings.orderPrefix, name: tenants.name }).from(shopSettings)
    .innerJoin(tenants, eq(tenants.id, shopSettings.tenantId)).where(eq(shopSettings.tenantId, tenantId))
  return orderPrefix(shop?.prefix ?? '', shop?.name ?? '')
}
