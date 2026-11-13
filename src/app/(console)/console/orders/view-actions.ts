'use server'

import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { filterQuery, parseFilters } from '@/domains/orders/filters'
import { QUEUE_TABS } from '@/domains/orders/order-state'
import { ANY_MEMBER } from '@/domains/tenancy/roles'
import { asMember } from '@/lib/auth/as-member'
import { savedViews } from '@/lib/db/schema-views'
import { MAX_VIEWS } from '@/lib/queries/saved-views'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/app/(console)/console/orders/view-actions.ts — SAVE, RENAME, REMOVE AND RESTORE A VIEW (Neel N1c·2).
//
// Who: everyone who sees Orders (owner, admin, staff, partner; never the accountant), through asMember, the tenant from
// the membership. A view is the team's: any of them may rename or remove one. The filters are re-parsed and stored in
// their canonical form, never as sent; a view never holds a search. At most 20 a shop, counted under an advisory lock
// (never a row lock on tenants, which every order insert's foreign key shares). Rename, remove and restore touch a row
// only by (tenant, id): another shop's id finds nothing. A support visit is audited by asMember.
// =============================================================================

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

// No control characters and no bidi overrides: one member must not make a tab read differently to the others.
const Name = z.string().transform((s) => s.normalize('NFC').trim()).pipe(z.string().min(1, 'Name the view.').max(40, 'Up to 40 characters.')
  .refine((s) => !/[\u0000-\u001f\u007f‪-‮⁦-⁩]/.test(s), 'Use letters, numbers and spaces.'))
const Id = z.string().uuid()
const Save = z.object({ name: Name, tab: z.enum(QUEUE_TABS), query: z.string().max(400) })

const taken = (err: unknown) => (err as { code?: string })?.code === '23505'
const done = () => revalidatePath('/console/orders')

export async function saveView(input: { name: string; tab: string; query: string }): Promise<Result<{ id: string; name: string }>> {
  const p = Save.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check the name.' }
  const query = filterQuery(parseFilters(Object.fromEntries(new URLSearchParams(p.data.query))))
  try {
    const r = await asMember(ANY_MEMBER, { action: 'orders.view_save' }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:views`}, 0))`)
      const [n] = await tx.select({ n: count() }).from(savedViews).where(and(eq(savedViews.tenantId, tenantId), isNull(savedViews.removedAt)))
      if ((n?.n ?? 0) >= MAX_VIEWS) return { ok: false as const, error: `Up to ${MAX_VIEWS} views. Remove one first.` }
      const [row] = await tx.insert(savedViews).values({ tenantId, name: p.data.name, tab: p.data.tab, query, createdBy: auth.userId }).returning({ id: savedViews.id, name: savedViews.name })
      return { ok: true as const, id: row!.id, name: row!.name }
    })
    if (!r.ok) return r
    if (r.value.ok) done()
    return r.value
  } catch (err) {
    if (taken(err)) return { ok: false, error: 'A view with that name exists.' }
    console.error('[orders] view save', errName(err))
    return { ok: false, error: 'We could not save the view. Try again.' }
  }
}

async function change(id: string, what: 'rename' | 'remove' | 'restore', name?: string): Promise<Result<{ name: string }>> {
  if (!Id.safeParse(id).success) return { ok: false, error: 'View not found.' }
  let newName: string | undefined
  if (what === 'rename') {
    const p = Name.safeParse(name ?? '')
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check the name.' }
    newName = p.data
  }
  try {
    const r = await asMember(ANY_MEMBER, { action: `orders.view_${what}`, target: id }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const where = and(eq(savedViews.tenantId, tenantId), eq(savedViews.id, id), what === 'restore' ? sql`${savedViews.removedAt} is not null` : isNull(savedViews.removedAt))
      if (what === 'restore') {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:views`}, 0))`)
        const [n] = await tx.select({ n: count() }).from(savedViews).where(and(eq(savedViews.tenantId, tenantId), isNull(savedViews.removedAt)))
        if ((n?.n ?? 0) >= MAX_VIEWS) return null
      }
      const set = what === 'rename' ? { name: newName!, updatedAt: new Date() } : what === 'remove' ? { removedAt: new Date(), updatedAt: new Date() } : { removedAt: null, updatedAt: new Date() }
      const [row] = await tx.update(savedViews).set(set).where(where).returning({ name: savedViews.name })
      return row ?? null
    })
    if (!r.ok) return r
    if (!r.value) return { ok: false, error: what === 'restore' ? `Up to ${MAX_VIEWS} views, or it is back already.` : 'View not found.' }
    done()
    return { ok: true, name: r.value.name }
  } catch (err) {
    if (taken(err)) return { ok: false, error: 'A view with that name exists.' }
    console.error(`[orders] view ${what}`, errName(err))
    return { ok: false, error: 'We could not change the view. Try again.' }
  }
}

export async function renameView(id: string, name: string) { return change(id, 'rename', name) }
export async function removeView(id: string) { return change(id, 'remove') }
export async function restoreView(id: string) { return change(id, 'restore') }
