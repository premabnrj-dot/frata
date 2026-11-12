'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PRODUCT_STATUSES } from '@/lib/db/schema-catalogue'
import { collectionProducts, collections, productAttributes, productColours, products, variants } from '@/lib/db/schema-catalogue'
import { asMember } from '@/lib/auth/as-member'
import { memberAudit } from '@/lib/auth/member-audit'
import { ANY_MEMBER } from '@/lib/auth/require-member'
import { arrayParam } from '@/lib/db/sql-array'
import { freeHandle } from '@/lib/catalogue/handles'
import { deleteProducts, type Kept } from '@/lib/catalogue/delete-products'
import { removePhotoFiles } from '@/lib/catalogue/photo-files'
import { setStatusIn, type Before, type StatusResult } from '@/lib/catalogue/status'
import { refreshShop } from '@/lib/queries/storefront'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/app/(console)/console/products/bulk-actions.ts
//
// THE PRODUCTS LIST'S ACTIONS ON MANY (plan docs/plans/2026-11-13-products-pr1.md): Set status, Archive (and its Undo),
// Delete, Duplicate, Add to collection. Any member, as in the editor (each can already publish or archive one there).
// Ids come from the browser: Zod uuids, at most 50 (one page), and every statement filters by the member's own shop,
// so another shop's id is simply not found. One audit row per action, its ids in the detail. The shop is refreshed
// after every commit.
// =============================================================================

const Ids = z.array(z.string().uuid()).min(1).max(50).transform((a) => [...new Set(a.map((x) => x.toLowerCase()))])
const StatusZ = z.enum(PRODUCT_STATUSES)
type Fail = { ok: false; error: string }
const failed = (who: string, err: unknown, error: string): Fail => { console.error(`[${who}]`, errName(err)); return { ok: false, error } }
const done = (tenantId: string) => { refreshShop(tenantId, 'catalogue'); revalidatePath('/console/products', 'layout') }

export type BulkStatus = { ok: true; changed: number; refused: { title: string; needs: string[] }[]; before: Before[] }

/** Set status (Draft, Active, Unlisted, Archived) on up to 50; going live needs each to be ready, the rest are named. */
export async function bulkStatus(input: unknown, statusInput: unknown): Promise<BulkStatus | Fail> {
  const ids = Ids.safeParse(input), status = StatusZ.safeParse(statusInput)
  if (!ids.success || !status.success) return { ok: false, error: 'Pick up to 50 products and a status.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.bulk_status', target: `${ids.data.length} products`, detail: { status: status.data, ids: ids.data } }, async (tx, auth) => {
      const out = await setStatusIn(tx, auth.membership.tenantId, ids.data, status.data, null, new Date())
      if (out.changed.length) await memberAudit(tx, auth, `product.bulk_status.${status.data}`, `${out.changed.length} products`)
      return out
    })
    if (!r.ok) return { ok: false, error: r.error }
    done(r.tenantId)
    return result(r.value)
  } catch (err) {
    return failed('bulkStatus', err, 'We could not change them. Nothing was changed.')
  }
}

const result = (out: StatusResult): BulkStatus => ({ ok: true, changed: out.changed.length, refused: out.refused.map((x) => ({ title: x.title, needs: x.needs })), before: out.before })

const Undo = z.array(z.object({ id: z.string().uuid(), status: StatusZ, publishAt: z.string().datetime({ offset: true }).nullable() })).min(1).max(50)

/** Undo of Archive or Set status: each back to what it was — a schedule still to come stays scheduled; going live
 *  again is checked as Set status checks it (never more than it would allow). */
export async function restoreStatus(input: unknown): Promise<{ ok: true; restored: number } | Fail> {
  const pairs = Undo.safeParse(input)
  if (!pairs.success) return { ok: false, error: 'There is nothing to undo.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.bulk_restore', target: `${pairs.data.length} products`, detail: { ids: pairs.data.map((p) => p.id) } }, async (tx, auth) => {
      const now = new Date()
      let restored = 0
      // Grouped by what each goes back to, so each group is one setStatusIn (rows locked in id order within it).
      const groups = new Map<string, { status: (typeof PRODUCT_STATUSES)[number]; at: Date | null; ids: string[] }>()
      for (const p of pairs.data) {
        const at = p.publishAt && new Date(p.publishAt) > now ? new Date(p.publishAt) : null
        const key = `${p.status}|${at?.toISOString() ?? ''}`
        const g = groups.get(key) ?? { status: p.status, at: p.status === 'active' ? at : null, ids: [] }
        g.ids.push(p.id.toLowerCase()); groups.set(key, g)
      }
      for (const g of groups.values()) restored += (await setStatusIn(tx, auth.membership.tenantId, g.ids, g.status, g.at, now)).changed.length
      if (restored) await memberAudit(tx, auth, 'product.bulk_restore', `${restored} products`)
      return restored
    })
    if (!r.ok) return { ok: false, error: r.error }
    done(r.tenantId)
    return { ok: true, restored: r.value }
  } catch (err) {
    return failed('restoreStatus', err, 'We could not undo that. Nothing was changed.')
  }
}

export type BulkDelete = { ok: true; deleted: number; kept: { id: string; title: string; why: Kept['why'] }[] }

/** Delete: only drafts never live, never ordered and with no video go (delete-products.ts); the rest are named with
 *  why, for the list to offer Archive. Their photo files go after the commit. */
export async function bulkDelete(input: unknown): Promise<BulkDelete | Fail> {
  const ids = Ids.safeParse(input)
  if (!ids.success) return { ok: false, error: 'Pick up to 50 products.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.bulk_delete', target: `${ids.data.length} products`, detail: { ids: ids.data } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const titles = await tx.select({ id: products.id, title: products.title }).from(products)
        .where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${arrayParam(ids.data, 'uuid')})`))
      const out = await deleteProducts(tx, tenantId, ids.data)
      if (out.deleted.length) await memberAudit(tx, auth, 'product.bulk_delete', `${out.deleted.length} products`)
      const name = new Map(titles.map((t) => [t.id, t.title]))
      return { ...out, kept: out.kept.map((k) => ({ ...k, title: name.get(k.id) ?? '' })) }
    })
    if (!r.ok) return { ok: false, error: r.error }
    await removePhotoFiles(r.tenantId, r.value.photos, 'bulkDelete')
    done(r.tenantId)
    return { ok: true, deleted: r.value.deleted.length, kept: r.value.kept }
  } catch (err) {
    return failed('bulkDelete', err, 'We could not delete them. Nothing was changed.')
  }
}

/** Duplicate one product as a draft "<name> copy": its details, sizes and colours, prices, collections and stories —
 *  never its photos (each file belongs to one product: a copy sharing them would take them with it when deleted), its
 *  stock, SKUs or barcodes (made fresh on its first save), its address history or its status. */
export async function duplicateProduct(input: unknown): Promise<{ ok: true; id: string; handle: string } | Fail> {
  const id = z.string().uuid().safeParse(input)
  if (!id.success) return { ok: false, error: 'That product is not in your shop.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.duplicate', target: id.data }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [src] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, id.data)))
      if (!src) return null
      const title = `${src.title} copy`.slice(0, 140)
      const [p] = await tx.insert(products).values({
        tenantId, title, handle: await freeHandle(tx, tenantId, title), status: 'draft',
        description: src.description, typeId: src.typeId, options: src.options, optionValues: src.optionValues,
        modelHeight: src.modelHeight, modelSize: src.modelSize, originCountry: src.originCountry, hsn: src.hsn, uqc: src.uqc,
        gstBps: src.gstBps, label: src.label, stories: src.stories, taxonomyCategory: src.taxonomyCategory, tags: src.tags,
      }).returning({ id: products.id, handle: products.handle })
      const vs = await tx.select().from(variants).where(and(eq(variants.tenantId, tenantId), eq(variants.productId, src.id), sql`${variants.archivedAt} is null`))
      if (vs.length) await tx.insert(variants).values(vs.map((v) => ({
        tenantId, productId: p!.id, optionValues: v.optionValues, price: v.price, compareAt: v.compareAt, unitCost: v.unitCost, stock: 0,
        weightGrams: v.weightGrams, whenOut: v.whenOut, shipsBy: v.shipsBy, leadMinDays: v.leadMinDays, leadMaxDays: v.leadMaxDays, preorderCap: v.preorderCap, position: v.position,
      })))
      const [cols, attrs, links] = await Promise.all([
        tx.select().from(productColours).where(and(eq(productColours.tenantId, tenantId), eq(productColours.productId, src.id))),
        tx.select().from(productAttributes).where(and(eq(productAttributes.tenantId, tenantId), eq(productAttributes.productId, src.id))),
        tx.select({ collectionId: collectionProducts.collectionId, position: collectionProducts.position }).from(collectionProducts)
          .innerJoin(collections, and(eq(collections.tenantId, collectionProducts.tenantId), eq(collections.id, collectionProducts.collectionId), eq(collections.kind, 'manual')))
          .where(and(eq(collectionProducts.tenantId, tenantId), eq(collectionProducts.productId, src.id))),
      ])
      // A swatch keeps its colour, not its cut from a photo the copy doesn't have.
      if (cols.length) await tx.insert(productColours).values(cols.map((c) => ({ tenantId, productId: p!.id, value: c.value, family: c.family, hex: c.hex })))
      if (attrs.length) await tx.insert(productAttributes).values(attrs.map((a) => ({ tenantId, productId: p!.id, attribute: a.attribute, values: a.values })))
      if (links.length) await tx.insert(collectionProducts).values(links.map((l) => ({ tenantId, collectionId: l.collectionId, productId: p!.id, position: l.position }))).onConflictDoNothing()
      await memberAudit(tx, auth, 'product.duplicate', src.title)
      return p!
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value) return { ok: false, error: 'That product is not in your shop.' }
    done(r.tenantId)
    return { ok: true, id: r.value.id, handle: r.value.handle }
  } catch (err) {
    return failed('duplicateProduct', err, 'We could not duplicate it. Nothing was changed.')
  }
}

/** Add up to 50 to one of this shop's own collections (a manual one: an automatic collection picks by its rules). */
export async function addToCollection(input: unknown, collectionInput: unknown): Promise<{ ok: true; added: number; name: string } | Fail> {
  const ids = Ids.safeParse(input), cid = z.string().uuid().safeParse(collectionInput)
  if (!ids.success || !cid.success) return { ok: false, error: 'Pick up to 50 products and a collection.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'collection.bulk_add', target: cid.data, detail: { ids: ids.data } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [c] = await tx.select({ id: collections.id, name: collections.title }).from(collections)
        .where(and(eq(collections.tenantId, tenantId), eq(collections.id, cid.data), eq(collections.kind, 'manual'))).for('share')
      if (!c) return null
      const mine = await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${arrayParam(ids.data, 'uuid')})`))
      const added = mine.length ? await tx.insert(collectionProducts).values(mine.map((p) => ({ tenantId, collectionId: c.id, productId: p.id, position: 0 })))
        .onConflictDoNothing().returning({ productId: collectionProducts.productId }) : []
      if (added.length) await memberAudit(tx, auth, 'collection.bulk_add', `${added.length} to ${c.name}`)
      return { added: added.length, name: c.name }
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value) return { ok: false, error: 'That collection is not in your shop.' }
    done(r.tenantId)
    return { ok: true, ...r.value }
  } catch (err) {
    return failed('addToCollection', err, 'We could not add them. Nothing was changed.')
  }
}
