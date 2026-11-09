'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cleanRules, matches } from '@/domains/catalogue/collection-rules'
import { handleFor } from '@/domains/catalogue/variants'
import { refreshShop } from '@/lib/queries/storefront'
import { asMember } from '@/lib/auth/as-member'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { collectionHandleHistory, collectionProducts, collections, products } from '@/lib/db/schema-catalogue'
import { productFacts } from '@/lib/queries/catalogue'
import { errName } from '@/lib/log'

// Collections (1A·7): the shop's own groups for menus and pages. Hand-picked
// (manual) or filled by rules (auto). Any member may edit; every write through
// asMember. The tenant is always the member's.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: Record<string, string> }
class Stop extends Error { constructor(public result: { ok: false; error: string; errors?: Record<string, string> }) { super('stop') } }

export type CollectionInput = { title: string; handle: string; description: string; seoTitle?: string; seoDescription?: string; kind: 'manual' | 'auto'; matchAll: boolean; rules: unknown; sort: string; productIds: string[] }
const SORTS = ['manual', 'newest', 'price_low', 'price_high', 'title']
const HANDLE = /^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/

function clean(c: CollectionInput) {
  const errors: Record<string, string> = {}
  const title = String(c.title ?? '').trim().replace(/\s+/g, ' ')
  if (!title || title.length > 80) errors.title = 'A name of up to 80 characters, like Festive edit.'
  const handle = (String(c.handle ?? '').trim().toLowerCase() || handleFor(title)).slice(0, 80).replace(/-+$/, '')
  if (!HANDLE.test(handle) || handle.includes('--')) errors.handle = 'Lowercase letters, digits and hyphens.'
  const description = String(c.description ?? '').trim()
  if (description.length > 2000) errors.description = 'Up to 2,000 characters.'
  const seoTitle = String(c.seoTitle ?? '').trim().replace(/\s+/g, ' ')
  if (seoTitle.length > 200) errors.seoTitle = 'Up to 200 characters.'
  const seoDescription = String(c.seoDescription ?? '').trim().replace(/\s+/g, ' ')
  if (seoDescription.length > 400) errors.seoDescription = 'Up to 400 characters.'
  const kind = c.kind === 'auto' ? 'auto' : 'manual'
  const rules = kind === 'auto' ? cleanRules(c.rules) : []
  if (kind === 'auto' && !rules.length) errors.rules = 'Add at least one rule.'
  const sort = SORTS.includes(c.sort) ? c.sort : 'newest'
  if (kind === 'auto' && sort === 'manual') errors.sort = 'Automatic collections sort by newest, price or name.'
  const productIds = kind === 'manual' ? [...new Set((Array.isArray(c.productIds) ? c.productIds : []).filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)))].slice(0, 500) : []
  return { errors, value: { title, handle, description, seoTitle, seoDescription, kind, matchAll: c.matchAll === false ? 0 : 1, rules, sort, productIds } }
}

/** Create (id null) or save a collection. */
export async function saveCollection(id: string | null, input: CollectionInput): Promise<Result<{ handle: string }>> {
  const { errors, value: c } = clean(input)
  if (Object.keys(errors).length) return { ok: false, error: 'Some fields need a look before saving.', errors }
  try {
    const r = await asMember(ANY_MEMBER, { action: id ? 'collection.save' : 'collection.create', target: c.title }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [clash] = await tx.select({ id: collections.id }).from(collections).where(and(eq(collections.tenantId, tenantId), eq(collections.handle, c.handle), id ? sql`${collections.id} <> ${id}` : sql`true`)).limit(1)
      // Another collection's old address stays reserved: it redirects there (S2·2).
      const [oldClash] = clash ? [] : await tx.select({ id: collectionHandleHistory.collectionId }).from(collectionHandleHistory).where(and(eq(collectionHandleHistory.tenantId, tenantId), eq(collectionHandleHistory.handle, c.handle), id ? sql`${collectionHandleHistory.collectionId} <> ${id}` : sql`true`)).limit(1)
      if (clash || oldClash) throw new Stop({ ok: false, error: 'Another collection uses that address.', errors: { handle: 'Another collection uses (or used) this address.' } })
      const data = { title: c.title, handle: c.handle, description: c.description, seoTitle: c.seoTitle, seoDescription: c.seoDescription, kind: c.kind, matchAll: c.matchAll, rules: c.rules, sort: c.sort, updatedAt: new Date() }
      let cid = id
      if (id) {
        // A changed address: the old one keeps working and sends shoppers here (append-only; going back needs nothing).
        const [cur] = await tx.select({ handle: collections.handle }).from(collections).where(and(eq(collections.tenantId, tenantId), eq(collections.id, id)))
        if (cur && cur.handle !== c.handle) await tx.insert(collectionHandleHistory).values({ tenantId, handle: cur.handle, collectionId: id }).onConflictDoNothing()
        const [row] = await tx.update(collections).set(data).where(and(eq(collections.tenantId, tenantId), eq(collections.id, id))).returning({ id: collections.id })
        if (!row) throw new Stop({ ok: false, error: 'That collection is not in your shop.' })
      } else {
        const [row] = await tx.insert(collections).values({ tenantId, ...data }).returning({ id: collections.id })
        cid = row!.id
      }
      // Hand-picked products, in order: only this shop's.
      await tx.delete(collectionProducts).where(and(eq(collectionProducts.tenantId, tenantId), eq(collectionProducts.collectionId, cid!)))
      if (c.productIds.length) {
        const own = await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, c.productIds)))
        const ok = new Set(own.map((p) => p.id))
        const rows = c.productIds.filter((p) => ok.has(p)).map((productId, position) => ({ tenantId, collectionId: cid!, productId, position }))
        if (rows.length) await tx.insert(collectionProducts).values(rows)
      }
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: id ? 'collection.save' : 'collection.create', target: c.title })
      return c.handle
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/collections', 'layout')
    revalidatePath('/console/products', 'layout')
    return { ok: true, handle: r.value }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[saveCollection]', errName(err))
    return { ok: false, error: 'We could not save the collection. Nothing was changed.' }
  }
}

export async function deleteCollection(id: string): Promise<Result> {
  try {
    const r = await asMember(ANY_MEMBER, { action: 'collection.delete', target: id }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [row] = await tx.delete(collections).where(and(eq(collections.tenantId, tenantId), eq(collections.id, id))).returning({ title: collections.title })
      if (!row) throw new Stop({ ok: false, error: 'That collection is not in your shop.' })
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'collection.delete', target: row.title })
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/collections', 'layout')
    return { ok: true }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[deleteCollection]', err instanceof Error ? err.name : err)
    return { ok: false, error: 'We could not delete the collection.' }
  }
}

/** What a set of rules would hold right now: the count and the first few titles (the editor's live preview). */
export async function previewRules(rules: unknown, matchAll: boolean): Promise<{ count: number; sample: string[] }> {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return { count: 0, sample: [] }
  const rs = cleanRules(rules)
  const facts = await productFacts(auth.membership.tenantId)
  const hit = facts.filter((f) => matches(rs, matchAll, f))
  return { count: hit.length, sample: hit.slice(0, 5).map((f) => f.title) }
}
