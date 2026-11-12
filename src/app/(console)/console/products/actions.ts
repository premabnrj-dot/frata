'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { del } from '@vercel/blob'
import { cleanProduct, cleanTax, type ProductInput } from '@/domains/catalogue/product-form'
import { sellsSized } from '@/domains/catalogue/sell-keys'
import type { Status } from '@/domains/catalogue/availability'
import { attributesFor, categoryById, cleanAttributes, COLOUR_FAMILIES, searchCategories } from '@/domains/catalogue/taxonomy'
import { acceptedBase, storeHost, urlFor } from '@/domains/media/sizes'
import { photosAreMade } from '@/lib/media/uploaded'
import { checkStoryPhotos, savePairs } from '@/lib/catalogue/extras'
import { cleanPairIds, UUID, type Piece } from '@/domains/catalogue/stories'
import { refreshShop } from '@/lib/queries/storefront'
import { searchPieces } from '@/lib/queries/catalogue'
import { asMember } from '@/lib/auth/as-member'
import { memberAudit } from '@/lib/auth/member-audit'
import { costsVisibleIn, hsnDigitsIn } from '@/lib/queries/settings'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { BLOB_READ_WRITE_TOKEN, BLOB_STORE_ID } from '@/lib/env'
import { shopSettings } from '@/lib/db/schema'
import { collectionProducts, collections, productAttributes, productColours, productHandleHistory, productImages, products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { skuTaken, writeProducts } from '@/lib/catalogue/write'
import { goLive, readinessIn } from '@/lib/catalogue/readiness'
import { photosInUse } from '@/lib/catalogue/photos-in-use'
import { attachIn, type NewPhoto } from '@/lib/catalogue/photos'
import { lockTimedOut } from '@/lib/orders/place'
import { ensureTypes, freeHandle, handleFree } from '@/lib/catalogue/handles'
import { errName } from '@/lib/log'

// Catalogue changes (1A). Any member may edit products (staff run catalogues); every write goes through asMember, so a
// support visit is audited in the same transaction. The tenant is always the member's, never an argument.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: Record<string, string>; conflict?: boolean }
class Stop extends Error { constructor(public result: { ok: false; error: string; errors?: Record<string, string>; conflict?: boolean }) { super('stop') } }

const reason = errName
export async function createProduct(input: { title: string }): Promise<Result<{ id: string; handle: string }>> {
  const title = String(input?.title ?? '').trim().replace(/\s+/g, ' ')
  if (!title || title.length > 140) return { ok: false, error: 'Give your product a name of up to 140 characters.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.create', target: title }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      await ensureTypes(tx, tenantId)
      const [first] = await tx.select({ id: productTypes.id }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).orderBy(productTypes.name).limit(1)
      // A new product starts with the shop's starting HSN (Settings › Taxes), and with sizes only when the shop sells
      // sized things (clothing, footwear); a jewellery or beauty shop starts with one variant (all-categories § 2).
      const [shop] = await tx.select({ hsn: shopSettings.defaultHsn, sells: shopSettings.sells }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
      const sized = sellsSized(shop?.sells ?? [])
      const [p] = await tx.insert(products).values({
        tenantId, title, handle: await freeHandle(tx, tenantId, title), typeId: sized ? first?.id ?? null : null, hsn: shop?.hsn ?? null,
        ...(sized ? { options: ['Size'], optionValues: [['S', 'M', 'L']] } : {}),
      }).returning({ id: products.id, handle: products.handle })
      await tx.insert(variants).values((sized ? [['S'], ['M'], ['L']] : [[]]).map((v, i) => ({ tenantId, productId: p!.id, optionValues: v, price: 0, position: i })))
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

export async function saveProduct(productId: string, version: number, input: ProductInput, manualCollections: string[] = []): Promise<Result<{ version: number; handle: string }>> {
  const parsed = cleanProduct(input, new Date())
  if (!parsed.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: parsed.errors }
  const p = parsed.product
  // Signal S3: a story photo is one we made, WebP or JPEG (read outside the transaction), then this shop's own, rebuilt inside it.
  if (!(await photosAreMade((p.stories ?? []).flatMap((s) => (s.image ? [s.image] : []))))) return { ok: false, error: 'That file is not a photo we made. Upload it again.' }
  // Category, details and colour families are checked against the standard lists here, on the server.
  const category = categoryById(p.categoryId)
  const attrs = cleanAttributes(category?.id ?? null, p.attributes)
  const families = new Set(COLOUR_FAMILIES.map((c) => c.id))
  if (p.colours.some((c) => c.family && !families.has(c.family))) return { ok: false, error: 'That colour family is not one we know.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.save', target: p.title }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const stories = p.stories ? checkStoryPhotos(p.stories, tenantId, storeHost(BLOB_STORE_ID)) : null
      if (p.stories && !stories) throw new Stop({ ok: false, error: 'That photo didn’t come from this shop. Upload it again.' })
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
      // The tax again with the HSN digits the shop's turnover needs (cleanTax, the one rule; the check above assumed 4).
      if (input.tax) {
        const t = cleanTax(input.tax, new Date(), await hsnDigitsIn(tx, tenantId))
        if (!t.ok) throw new Stop({ ok: false, error: 'Some fields need a look before saving.', errors: Object.fromEntries(Object.entries(t.errors).map(([k, v]) => [`tax.${k}`, v])) })
      }
      const [row] = await tx.update(products).set({
        ...(p.tax ? { hsn: p.tax.hsn, uqc: p.tax.uqc, gstBps: p.tax.gstBps, originCountry: p.tax.originCountry } : {}), ...(p.label ? { label: p.label } : {}), ...(stories ? { stories } : {}),
        title: p.title, description: p.description, typeId: p.typeId, modelHeight: p.modelHeight, modelSize: p.modelSize,
        options: p.options.map((o) => o.name), optionValues: p.options.map((o) => o.values),
        handle: p.handle, seoTitle: p.seoTitle, seoDescription: p.seoDescription, taxonomyCategory: category?.id ?? null, tags: p.tags,
        version: sql`${products.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(products.tenantId, tenantId), eq(products.id, productId), eq(products.version, version))).returning({ version: products.version })
      if (!row) throw new Stop({ ok: false, conflict: true, error: 'Someone saved this product while you were editing. Reload to see their changes.' })
      // Signal S3: pairings are this shop's products only (and the FKs agree), saved under the same version check.
      if (p.pairs !== undefined && !(await savePairs(tx, tenantId, productId, cleanPairIds(p.pairs, productId)))) throw new Stop({ ok: false, error: 'A piece to pair isn’t in your shop. Pick it again.' })

      // Its sizes and colours: SKUs, barcodes, removed and returning sizes, the cost of goods only from whoever sees it
      // (seesCosts) — the one writer the import shares (src/lib/catalogue/write.ts).
      const costs = await costsVisibleIn(tx, tenantId, auth.membership.role)
      const written = await writeProducts(tx, tenantId, [{ productId, handle: p.handle, title: p.title, options: p.options, variants: p.variants }], { costs })
      if (!written.ok) throw new Stop({ ok: false, error: written.error })
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
    if (skuTaken(err)) return { ok: false, error: 'A SKU is already used by another product in your shop.' }
    if (why.includes('products_tenant_handle')) return { ok: false, error: 'Another product uses that address.', errors: { handle: 'Another product uses this address.' } }
    // A drop's checkout holds its sizes' rows for longer than writeProducts waits (1 s): expected, not an error.
    if (lockTimedOut(err)) return { ok: false, error: 'Someone is buying this product right now. Save again in a moment.' }
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
        // What it still needs (readiness.ts): a shop that charges GST can't sell a piece with no known rate (quote()
        // refuses it), so it can't go live without one.
        const missing = (await readinessIn(tx, tenantId, [productId], new Date())).get(productId)!.readiness.filter((x) => !x.ok)
        if (missing.length) throw new Stop({ ok: false, error: `Before shoppers can see it: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.` })
      }
      const now = new Date()
      if (live) await goLive(tx, tenantId, [productId], now, { status, at: when })
      else await tx.update(products).set({ status, publishAt: null, archivedAt: status === 'archived' ? now : null, updatedAt: now })
        .where(and(eq(products.tenantId, tenantId), eq(products.id, productId)))
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

/** "Pair it with"'s piece search (Signal S3): this shop's pieces only, never this product. */
export async function findPieces(productId: string, q: string): Promise<Piece[]> {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok || typeof q !== 'string' || typeof productId !== 'string' || !UUID.test(productId)) return []
  return searchPieces(auth.membership.tenantId, productId, q).catch((err) => { console.error('[findPieces]', reason(err)); return [] })
}
/** The details a category asks for, for the editor. */
export async function categoryDetails(id: string) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return null
  const c = categoryById(String(id ?? ''))
  return c ? { id: c.id, name: c.name, path: c.path, attributes: attributesFor(c.id) } : null
}

/** Photos the browser has uploaded (every width) — attached only if they are inside THIS shop's folder (attachIn). */
export async function attachPhotos(productId: string, photos: NewPhoto[]): Promise<Result> {
  if (!Array.isArray(photos) || !photos.length || photos.length > 12) return { ok: false, error: 'Up to 12 photos at a time.' }
  if (!(await photosAreMade(photos))) return { ok: false, error: 'That file is not a photo we made. Upload it again.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.photos', target: productId, detail: { added: photos.length } }, async (tx, auth) => {
      // The editor tags a colour afterwards (editPhoto): a photo arrives with none.
      const done = await attachIn(tx, auth.membership.tenantId, productId, photos.map((ph) => ({ ...ph, colour: null })))
      if (!done.ok) throw new Stop(done)
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
        // A look, a story or a page may show this photo: then its files stay, so a published or restorable look never
        // loses its photo (photos-in-use.ts).
        return { ...img, inLook: (await photosInUse(tx, tenantId, [img.base])).has(img.base) }
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
