'use server'

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { del } from '@vercel/blob'
import { presetsFor, cleanChart, type Chart } from '@/domains/catalogue/size-charts'
import { cleanProduct, readiness, type ProductInput } from '@/domains/catalogue/product-form'
import { availability, type Status, type WhenOut } from '@/domains/catalogue/availability'
import { attributesFor, categoryById, cleanAttributes, COLOUR_FAMILIES, searchCategories } from '@/domains/catalogue/taxonomy'
import { handleFor, keyOf, reconcile, skuFor, uniqueSku } from '@/domains/catalogue/variants'
import { orderPrefix } from '@/domains/signup/slug'
import { acceptedBase, storeHost, WIDTHS, urlFor } from '@/domains/media/sizes'
import { photosAreWebp } from '@/lib/media/uploaded'
import { refreshShop } from '@/lib/queries/storefront'
import { asMember } from '@/lib/auth/as-member'
import { costsVisibleIn } from '@/lib/queries/settings'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { BLOB_READ_WRITE_TOKEN, BLOB_STORE_ID } from '@/lib/env'
import type { Tx } from '@/lib/db'
import { auditEvents, shopSettings, tenants } from '@/lib/db/schema'
import { shopThemeRevisions } from '@/lib/db/schema-themes'
import { collectionProducts, collections, productAttributes, productColours, productHandleHistory, productImages, products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { archivedVariants, retireVariants } from '@/lib/catalogue/retire-variants'
import { errName } from '@/lib/log'

// Catalogue changes (1A). Any member may edit products (staff run catalogues);
// every write goes through asMember, so a support visit is audited in the same
// transaction. The tenant is always the member's, never an argument.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: Record<string, string>; conflict?: boolean }
class Stop extends Error { constructor(public result: { ok: false; error: string; errors?: Record<string, string>; conflict?: boolean }) { super('stop') } }

const reason = errName

async function memberAudit(tx: Tx, auth: { userId: string; email: string | null; membership: { tenantId: string; supportSessionId: string | null } }, action: string, target?: string) {
  if (!auth.membership.supportSessionId) {
    await tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action, target: target ?? null })
  }
}

/** The shop's starting size charts, made the first time they are needed (from what it said it sells). */
async function ensureTypes(tx: Tx, tenantId: string) {
  const existing = await tx.select({ id: productTypes.id }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).limit(1)
  if (existing.length) return
  const [s] = await tx.select({ sells: shopSettings.sells }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
  const presets = presetsFor((s?.sells ?? []) as Parameters<typeof presetsFor>[0])
  await tx.insert(productTypes).values(presets.map((p) => ({ tenantId, name: p.name, sizeChart: p.chart }))).onConflictDoNothing()
}

/** A free handle: "linen-kurta-set", else "-2", "-3"… within this shop. */
async function freeHandle(tx: Tx, tenantId: string, title: string, exceptId?: string): Promise<string> {
  const base = handleFor(title) || 'product'
  const taken = await tx.select({ handle: products.handle, id: products.id }).from(products)
    .where(and(eq(products.tenantId, tenantId), sql`${products.handle} = ${base} or ${products.handle} like ${base + '-%'}`))
  // Old addresses stay reserved for the product that had them (they redirect to it).
  const old = await tx.select({ handle: productHandleHistory.handle, id: productHandleHistory.productId }).from(productHandleHistory)
    .where(and(eq(productHandleHistory.tenantId, tenantId), sql`${productHandleHistory.handle} = ${base} or ${productHandleHistory.handle} like ${base + '-%'}`))
  const used = new Set([...taken, ...old].filter((t) => t.id !== exceptId).map((t) => t.handle))
  if (!used.has(base)) return base
  for (let n = 2; n < 1000; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${Date.now()}`
}

export async function createProduct(input: { title: string }): Promise<Result<{ id: string; handle: string }>> {
  const title = String(input?.title ?? '').trim().replace(/\s+/g, ' ')
  if (!title || title.length > 140) return { ok: false, error: 'Give your product a name of up to 140 characters.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.create', target: title }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      await ensureTypes(tx, tenantId)
      const [first] = await tx.select({ id: productTypes.id }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).orderBy(productTypes.name).limit(1)
      const [p] = await tx.insert(products).values({
        tenantId, title, handle: await freeHandle(tx, tenantId, title), typeId: first?.id ?? null,
        options: ['Size'], optionValues: [['S', 'M', 'L']],
      }).returning({ id: products.id, handle: products.handle })
      await tx.insert(variants).values(['S', 'M', 'L'].map((v, i) => ({ tenantId, productId: p!.id, optionValues: [v], price: 0, position: i })))
      await memberAudit(tx, auth, 'product.create', title)
      return p!
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/products')
    return { ok: true, id: r.value.id, handle: r.value.handle }
  } catch (err) {
    console.error('[createProduct]', reason(err))
    return { ok: false, error: 'We could not create the product. Nothing was saved.' }
  }
}

/** Is `handle` free for this product: not another product's, and not another product's old address. */
async function handleFree(tx: Tx, tenantId: string, handle: string, productId: string) {
  const [a] = await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.handle, handle), sql`${products.id} <> ${productId}`)).limit(1)
  if (a) return false
  const [b] = await tx.select({ id: productHandleHistory.productId }).from(productHandleHistory).where(and(eq(productHandleHistory.tenantId, tenantId), eq(productHandleHistory.handle, handle), sql`${productHandleHistory.productId} <> ${productId}`)).limit(1)
  return !b
}

export async function saveProduct(productId: string, version: number, input: ProductInput, manualCollections: string[] = []): Promise<Result<{ version: number; handle: string }>> {
  const parsed = cleanProduct(input, new Date())
  if (!parsed.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: parsed.errors }
  const p = parsed.product
  // Category, details and colour families are checked against the standard lists here, on the server.
  const category = categoryById(p.categoryId)
  const attrs = cleanAttributes(category?.id ?? null, p.attributes)
  const families = new Set(COLOUR_FAMILIES.map((c) => c.id))
  if (p.colours.some((c) => c.family && !families.has(c.family))) return { ok: false, error: 'That colour family is not one we know.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.save', target: p.title }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      if (p.typeId) {
        const [t] = await tx.select({ id: productTypes.id }).from(productTypes).where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.id, p.typeId)))
        if (!t) throw new Stop({ ok: false, error: 'That product type is not in your shop.' })
      }
      const [cur] = await tx.select({ handle: products.handle, publishedAt: products.publishedAt }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, productId)))
      if (!cur) throw new Stop({ ok: false, error: 'This product is not in your shop.' })
      if (p.handle !== cur.handle) {
        if (!(await handleFree(tx, tenantId, p.handle, productId))) throw new Stop({ ok: false, error: 'Another product uses that address.', errors: { handle: 'Another product uses (or used) this address.' } })
        // Once it has been live, the old address keeps working: it redirects here (seo.handleChange).
        if (cur.publishedAt) await tx.insert(productHandleHistory).values({ tenantId, handle: cur.handle, productId }).onConflictDoNothing()
        // Going back to one of its own old addresses needs nothing more: the current handle is looked up first,
        // and history is append-only (frata_app holds no delete on it).
      }
      const [row] = await tx.update(products).set({
        title: p.title, description: p.description, typeId: p.typeId, modelHeight: p.modelHeight, modelSize: p.modelSize,
        options: p.options.map((o) => o.name), optionValues: p.options.map((o) => o.values),
        handle: p.handle, seoTitle: p.seoTitle, seoDescription: p.seoDescription, taxonomyCategory: category?.id ?? null, tags: p.tags,
        version: sql`${products.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(products.tenantId, tenantId), eq(products.id, productId), eq(products.version, version))).returning({ version: products.version })
      if (!row) throw new Stop({ ok: false, conflict: true, error: 'Someone saved this product while you were editing. Reload to see their changes.' })

      const existing = await tx.select({ id: variants.id, optionValues: variants.optionValues }).from(variants)
        .where(and(eq(variants.tenantId, tenantId), eq(variants.productId, productId), isNull(variants.archivedAt)))
      const plan = reconcile(existing, p.options)
      // Removed sizes and colours: archived if ever ordered, deleted if not, refused with pre-orders to pack.
      const retired = await retireVariants(tx, tenantId, plan.remove.map((v) => v.id))
      if (!retired.ok) throw new Stop({ ok: false, error: retired.error })
      const archived = await archivedVariants(tx, tenantId, productId)
      // Empty SKUs get a default (skuFor), unique against every other SKU in this shop.
      const [shop] = await tx.select({ prefix: shopSettings.orderPrefix, name: tenants.name }).from(shopSettings).innerJoin(tenants, eq(tenants.id, shopSettings.tenantId)).where(eq(shopSettings.tenantId, tenantId))
      const others = await tx.select({ sku: variants.sku }).from(variants).where(and(eq(variants.tenantId, tenantId), sql`${variants.productId} <> ${productId}`, sql`${variants.sku} is not null`))
      const taken = new Set(others.map((o) => o.sku!.toUpperCase()))
      p.variants.forEach((v) => { if (v.sku) taken.add(v.sku.toUpperCase()) })
      const prefix = orderPrefix(shop?.prefix ?? '', shop?.name ?? '')
      for (const v of p.variants) {
        if (v.sku) { if (others.some((o) => o.sku!.toUpperCase() === v.sku!.toUpperCase())) throw new Stop({ ok: false, error: `SKU ${v.sku} is already used by another product in your shop.` }); continue }
        v.sku = uniqueSku(skuFor(prefix, p.handle, v.values), taken)
        taken.add(v.sku.toUpperCase())
      }
      const byKey = new Map(p.variants.map((v) => [keyOf(v.values), v]))
      // The cost of goods only from whoever sees it (seesCosts); otherwise the stored cost stays as it was.
      const costs = await costsVisibleIn(tx, tenantId, auth.membership.role)
      // SKUs cleared first so two variants can swap SKUs in one save.
      await tx.update(variants).set({ sku: null }).where(and(eq(variants.tenantId, tenantId), eq(variants.productId, productId)))
      for (const [i, values] of plan.wanted.entries()) {
        const v = byKey.get(keyOf(values))!
        const data = {
          price: v.price, compareAt: v.compareAt, ...(costs ? { unitCost: v.unitCost } : {}), stock: v.stock, sku: v.sku, gtin: v.gtin, position: i,
          whenOut: v.whenOut, shipsBy: v.shipsBy, leadMinDays: v.leadMinDays, leadMaxDays: v.leadMaxDays, preorderCap: v.preorderCap,
        }
        const kept = plan.keep.find((k) => keyOf(k.optionValues) === keyOf(values))
        const back = kept ? null : archived.find((a) => keyOf(a.optionValues) === keyOf(values))
        if (kept) await tx.update(variants).set(data).where(and(eq(variants.tenantId, tenantId), eq(variants.id, kept.id)))
        else if (back) await tx.update(variants).set({ ...data, archivedAt: null }).where(and(eq(variants.tenantId, tenantId), eq(variants.id, back.id)))
        else await tx.insert(variants).values({ tenantId, productId, optionValues: values, ...data })
      }
      // A photo tagged with a colour that no longer exists shows for every colour.
      const values = new Set(p.options.flatMap((o) => o.values))
      const imgs = await tx.select({ id: productImages.id, optionValue: productImages.optionValue }).from(productImages).where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId)))
      const stale = imgs.filter((i) => i.optionValue && !values.has(i.optionValue)).map((i) => i.id)
      if (stale.length) await tx.update(productImages).set({ optionValue: null }).where(and(eq(productImages.tenantId, tenantId), inArray(productImages.id, stale)))

      // Details for its category, replaced whole.
      await tx.delete(productAttributes).where(and(eq(productAttributes.tenantId, tenantId), eq(productAttributes.productId, productId)))
      const attrRows = Object.entries(attrs).map(([attribute, vals]) => ({ tenantId, productId, attribute, values: vals }))
      if (attrRows.length) await tx.insert(productAttributes).values(attrRows)
      // Colours: family and swatch. A photo crop only from this product's own photos.
      const ownImages = new Set(imgs.map((i) => i.id))
      await tx.delete(productColours).where(and(eq(productColours.tenantId, tenantId), eq(productColours.productId, productId)))
      const colourRows = p.colours.filter((c) => c.family || c.hex || c.crop).map((c) => {
        const crop = c.crop && ownImages.has(c.crop.imageId) ? c.crop : null
        return { tenantId, productId, value: c.value, family: c.family, hex: c.hex, cropImageId: crop?.imageId ?? null, crop: crop ? { x: crop.x, y: crop.y, r: crop.r } : null }
      })
      if (colourRows.length) await tx.insert(productColours).values(colourRows)
      // Hand-picked collections: only this shop's manual ones.
      const wanted = [...new Set(Array.isArray(manualCollections) ? manualCollections.filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)) : [])].slice(0, 50)
      const manual = await tx.select({ id: collections.id }).from(collections).where(and(eq(collections.tenantId, tenantId), eq(collections.kind, 'manual')))
      const manualIds = manual.map((m) => m.id)
      if (manualIds.length) {
        await tx.delete(collectionProducts).where(and(eq(collectionProducts.tenantId, tenantId), eq(collectionProducts.productId, productId), inArray(collectionProducts.collectionId, manualIds)))
        const keep = wanted.filter((id) => manualIds.includes(id))
        if (keep.length) await tx.insert(collectionProducts).values(keep.map((collectionId) => ({ tenantId, collectionId, productId, position: 0 })))
      }
      await memberAudit(tx, auth, 'product.save', p.title)
      return { version: row.version, handle: p.handle }
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/products', 'layout')
    return { ok: true, ...r.value }
  } catch (err) {
    if (err instanceof Stop) return err.result
    const why = reason(err)
    if (why.includes('variants_tenant_sku')) return { ok: false, error: 'A SKU is already used by another product in your shop.' }
    if (why.includes('products_tenant_handle')) return { ok: false, error: 'Another product uses that address.', errors: { handle: 'Another product uses this address.' } }
    console.error('[saveProduct]', why)
    return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
  }
}

/**
 * Who can find it: Draft, Active (now or from `publishAt`), Unlisted (link only),
 * Archived. Active and Unlisted need everything on the readiness list. The first
 * time it goes live is recorded: from then on its address is kept on a change.
 */
export async function setStatus(productId: string, status: Status, publishAt: string | null = null): Promise<Result> {
  if (!['draft', 'active', 'unlisted', 'archived'].includes(status)) return { ok: false, error: 'That is not a status.' }
  const when = status === 'active' && publishAt ? new Date(publishAt) : null
  if (when && (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 366 * 86400000)) return { ok: false, error: 'Pick a date and time within a year.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.status', target: productId, detail: { status } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [p] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, productId)))
      if (!p) throw new Stop({ ok: false, error: 'This product is not in your shop.' })
      const live = status === 'active' || status === 'unlisted'
      if (live) {
        const vs = await tx.select().from(variants).where(and(eq(variants.tenantId, tenantId), eq(variants.productId, productId), isNull(variants.archivedAt)))
        const n = (await tx.select({ n: sql<number>`count(*)::int` }).from(productImages).where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId))))[0]?.n ?? 0
        const chart = p.typeId ? (await tx.select({ c: productTypes.sizeChart }).from(productTypes).where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.id, p.typeId))))[0]?.c : null
        const now = new Date()
        const anyBuyable = vs.some((v) => availability({ stock: v.stock, whenOut: v.whenOut as WhenOut, shipsBy: v.shipsBy, leadMinDays: v.leadMinDays, leadMaxDays: v.leadMaxDays, preorderCap: v.preorderCap }, now).canBuy)
        const missing = readiness({ title: p.title, photos: n, prices: vs.map((v) => v.price), hasSizes: p.options.some((o) => /^sizes?$/i.test(o)), chartRows: chart?.rows.length ?? 0, anyBuyable }).filter((x) => !x.ok)
        if (missing.length) throw new Stop({ ok: false, error: `Before shoppers can see it: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.` })
      }
      const goesLive = live && (!when || when <= new Date())
      await tx.update(products).set({
        status, publishAt: when, archivedAt: status === 'archived' ? new Date() : null,
        // Set the first time it is live (or due to be: a scheduled drop counts from its moment).
        publishedAt: p.publishedAt ?? (goesLive ? new Date() : live ? when : null), updatedAt: new Date(),
      }).where(and(eq(products.tenantId, tenantId), eq(products.id, productId)))
      await memberAudit(tx, auth, `product.status.${status}`, p.title)
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/products', 'layout')
    return { ok: true }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[setStatus]', reason(err))
    return { ok: false, error: 'We could not change that. Nothing was changed.' }
  }
}

/** The category picker's search (the taxonomy stays on the server: it is 250 KB). */
export async function findCategories(q: string) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return []
  return searchCategories(String(q ?? '').slice(0, 60)).map((c) => ({ id: c.id, name: c.name, path: c.path }))
}

/** The details a category asks for, for the editor. */
export async function categoryDetails(id: string) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return null
  const c = categoryById(String(id ?? ''))
  return c ? { id: c.id, name: c.name, path: c.path, attributes: attributesFor(c.id) } : null
}

/** Photos the browser has uploaded (every width) — attached only if they are inside THIS shop's folder. */
export async function attachPhotos(productId: string, photos: { base: string; widths: number[]; width: number; height: number }[]): Promise<Result> {
  if (!Array.isArray(photos) || !photos.length || photos.length > 12) return { ok: false, error: 'Up to 12 photos at a time.' }
  if (!(await photosAreWebp(photos))) return { ok: false, error: 'That file is not a photo we made. Upload it again.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.photos', target: productId, detail: { added: photos.length } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const host = storeHost(BLOB_STORE_ID)
      if (!host) throw new Stop({ ok: false, error: 'Photo storage is not connected.' })
      // The stored URL is the REBUILT one from acceptedBase, never the browser's string (tenancy audit).
      const clean = photos.map((ph) => {
        const base = acceptedBase(ph.base, host, tenantId, 'products')
        if (!base) throw new Stop({ ok: false, error: 'That photo is not in your shop’s folder.' })
        if (!ph.widths.length || ph.widths.some((w) => !(WIDTHS as readonly number[]).includes(w)) || !(ph.width > 0 && ph.height > 0)) throw new Stop({ ok: false, error: 'That photo’s sizes are not ones we make.' })
        return { ...ph, base }
      })
      const [p] = await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, productId)))
      if (!p) throw new Stop({ ok: false, error: 'This product is not in your shop.' })
      const last = (await tx.select({ last: sql<number>`coalesce(max(position), -1)::int` }).from(productImages).where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId))))[0]?.last ?? -1
      await tx.insert(productImages).values(clean.map((ph, i) => ({ tenantId, productId, base: ph.base, widths: [...ph.widths].sort((a, b) => a - b), width: Math.round(ph.width), height: Math.round(ph.height), position: last + 1 + i })))
      await tx.update(products).set({ updatedAt: new Date() }).where(and(eq(products.tenantId, tenantId), eq(products.id, productId)))
      await memberAudit(tx, auth, 'product.photos', productId)
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/products', 'layout')
    return { ok: true }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[attachPhotos]', reason(err))
    return { ok: false, error: 'We could not add the photos. Try again.' }
  }
}

/** Move a photo, tag it with a colour, or remove it (its files are deleted after the row). */
export async function editPhoto(imageId: string, change: { move?: -1 | 1; optionValue?: string | null; alt?: string; remove?: true }): Promise<Result> {
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.photo', target: imageId }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [img] = await tx.select().from(productImages).where(and(eq(productImages.tenantId, tenantId), eq(productImages.id, imageId)))
      if (!img) throw new Stop({ ok: false, error: 'That photo is not in your shop.' })
      if (change.remove) {
        await tx.delete(productImages).where(and(eq(productImages.tenantId, tenantId), eq(productImages.id, imageId)))
        // A look may show this photo (Look v3: "From your products"): then its files stay, so a published or
        // restorable look never loses its photo (security review 2026-11-09).
        const [used] = await tx.select({ id: shopThemeRevisions.id }).from(shopThemeRevisions)
          .where(and(eq(shopThemeRevisions.tenantId, tenantId), sql`position(${img.base} in ${shopThemeRevisions.settings}::text) > 0`)).limit(1)
        return { ...img, inLook: !!used }
      }
      if (change.move) {
        const all = await tx.select({ id: productImages.id }).from(productImages).where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, img.productId))).orderBy(productImages.position)
        const i = all.findIndex((x) => x.id === imageId), j = i + change.move
        if (j >= 0 && j < all.length) {
          [all[i], all[j]] = [all[j]!, all[i]!]
          for (const [pos, x] of all.entries()) await tx.update(productImages).set({ position: pos }).where(and(eq(productImages.tenantId, tenantId), eq(productImages.id, x.id)))
        }
      }
      if (change.optionValue !== undefined || change.alt !== undefined) {
        await tx.update(productImages).set({
          ...(change.optionValue !== undefined ? { optionValue: change.optionValue ? String(change.optionValue).slice(0, 40) : null } : {}),
          ...(change.alt !== undefined ? { alt: String(change.alt).slice(0, 200) } : {}),
        }).where(and(eq(productImages.tenantId, tenantId), eq(productImages.id, imageId)))
      }
      await memberAudit(tx, auth, 'product.photo', img.productId)
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    // Delete the files only if the stored base is still exactly inside this shop's folder.
    const host = storeHost(BLOB_STORE_ID)
    if (r.value && !r.value.inLook && BLOB_READ_WRITE_TOKEN && host && acceptedBase(r.value.base, host, r.value.tenantId, 'products') === r.value.base) {
      await del(r.value.widths.map((w) => urlFor(r.value!.base, w)), { token: BLOB_READ_WRITE_TOKEN }).catch((e) => console.error('[editPhoto] blob delete', errName(e)))
    }
    revalidatePath('/console/products', 'layout')
    return { ok: true }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[editPhoto]', reason(err))
    return { ok: false, error: 'We could not change the photo.' }
  }
}

/** A product type's size chart, shared by every product of that type. */
export async function saveSizeChart(typeId: string, chart: Chart): Promise<Result> {
  const c = cleanChart(chart)
  if (!c.ok) return { ok: false, error: c.error }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'size_chart.save', target: typeId }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [row] = await tx.update(productTypes).set({ sizeChart: c.chart, updatedAt: new Date() })
        .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.id, typeId))).returning({ name: productTypes.name })
      if (!row) throw new Stop({ ok: false, error: 'That product type is not in your shop.' })
      await memberAudit(tx, auth, 'size_chart.save', row.name)
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/products', 'layout')
    return { ok: true }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[saveSizeChart]', reason(err))
    return { ok: false, error: 'We could not save the size chart.' }
  }
}

/** A new product type, starting from an empty chart or a copy of another type's. */
export async function createType(name: string, copyFrom: string | null): Promise<Result<{ id: string }>> {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (!n || n.length > 60) return { ok: false, error: 'A name of up to 60 characters, like Saree.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product_type.create', target: n }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      let chart: Chart = { columns: [], rows: [], howToMeasure: '' }
      if (copyFrom) {
        const [src] = await tx.select({ c: productTypes.sizeChart }).from(productTypes).where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.id, copyFrom)))
        if (src) chart = src.c
      }
      const [row] = await tx.insert(productTypes).values({ tenantId, name: n, sizeChart: chart }).onConflictDoNothing().returning({ id: productTypes.id })
      if (!row) throw new Stop({ ok: false, error: `You already have a type called ${n}.` })
      await memberAudit(tx, auth, 'product_type.create', n)
      return row.id
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    return { ok: true, id: r.value }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[createType]', reason(err))
    return { ok: false, error: 'We could not create the type.' }
  }
}
