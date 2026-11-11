'use server'

import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { storeHost } from '@/domains/media/sizes'
import { cleanFill } from '@/domains/themes/clean-images'
import { prunePage } from '@/domains/pages/page'
import { PAGE_TEMPLATES, PageDraftSchema, TEMPLATE_NAMES, handleOf, type PageDraft, type PageTemplate } from '@/domains/pages/templates'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD } from '@/lib/auth/require-member'
import { shopPages } from '@/lib/db/schema-themes'
import { BLOB_STORE_ID } from '@/lib/env'
import { draftOf } from '@/lib/themes/pages'

// =============================================================================
// Console › Look › Pages (Theme Studio TS1a; plan § Decisions). Every action edits a page's DRAFT only: nothing reaches
// the shop until the look's Publish (owner or admin). Who: CAN_BUILD (owner, admin, partner); never a Frrata support
// visit. The page is found only under the member's own shop, by id, and its `version` must be the one the editor
// holds. Page saves take the look's per-shop lock (as the look's saves and publishes do).
// =============================================================================

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const SUPPORT = 'Frrata support can look, not change the shop’s pages.'
const lock = (tx: Parameters<Parameters<typeof asMember>[2]>[0], t: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`look:${t}`}))`)
/** A draft as bytes, below the page's 32 kB check (words checked first, so the owner reads why). */
const MAX_DRAFT_BYTES = 30_000

/** Add an About or FAQ page: a draft with the template's words as examples, at an address made from its title. */
export async function addPageAction(input: unknown): Promise<R<{ id: string; version: number; handle: string }>> {
  const p = z.object({ template: z.enum(PAGE_TEMPLATES) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Pick About or FAQ.' }
  const r = await asMember(CAN_BUILD, { action: 'page.add', target: p.data.template }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    await lock(tx, t)
    const rows = await tx.select({ draft: shopPages.draft, template: shopPages.template }).from(shopPages).where(eq(shopPages.tenantId, t))
    if (rows.length >= 20) return { error: 'A shop has at most 20 pages. Remove one first.' }
    if (p.data.template === 'faq' && rows.some((x) => x.template === 'faq')) return { error: 'Your shop has its FAQ already.' }
    const title = p.data.template === 'faq' ? 'Questions, answered' : 'Our story'
    const taken = new Set(rows.map((x) => (x.draft as { handle?: string }).handle))
    const base = p.data.template === 'faq' ? 'faq' : handleOf(title)
    let handle = base
    for (let i = 2; taken.has(handle); i++) handle = `${base}-${i}`.slice(0, 60)
    const draft: PageDraft = { title, handle, fill: {}, hidden: false }
    const [row] = await tx.insert(shopPages).values({ tenantId: t, template: p.data.template, draft }).returning({ id: shopPages.id, version: shopPages.version })
    return { id: row!.id, version: row!.version, handle }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  return { ok: true, ...(r.value as { id: string; version: number; handle: string }) }
}

/** Autosave a page's draft (title, address until first published, words, hidden). */
export async function savePageAction(input: unknown): Promise<R<{ version: number }>> {
  const p = z.object({ id: z.uuid(), version: z.number().int().positive(), draft: PageDraftSchema }).safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.path.includes('handle') ? 'An address is a-z, 0-9 and dashes.' : p.error.issues[0]?.path.includes('title') ? 'A title is plain words, up to 60 characters.' : 'That change could not be saved.' }
  const r = await asMember(CAN_BUILD, { action: 'page.save' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    await lock(tx, t)
    const [row] = await tx.select().from(shopPages).where(and(eq(shopPages.tenantId, t), eq(shopPages.id, p.data.id))).for('update')
    if (!row || row.removedAt) return { error: 'This page is gone. Reload.' }
    if (row.version !== p.data.version) return { error: 'This page changed in another window. Reload to see it.' }
    // The address is fixed once the page has been live (owner 2026-11-11): only a draft that never went live moves.
    const was = row.live as { handle?: string } | null, prev = row.previous as { handle?: string } | null
    const fixed = was?.handle ?? prev?.handle ?? (row.livePublishId ? draftOf(row)?.handle : undefined)
    const wanted = prunePage(row.template as PageTemplate, { ...p.data.draft, handle: fixed ?? p.data.draft.handle })
    // Every photo is this shop's own (its theme folder or its product photos: security review M3).
    const fill = cleanFill(wanted.fill, t, storeHost(BLOB_STORE_ID))
    if (!fill) return { error: 'A photo didn’t come from this shop. Upload it again.' }
    const draft = { ...wanted, fill }
    if (new TextEncoder().encode(JSON.stringify(draft)).length * 1.1 > MAX_DRAFT_BYTES) return { error: 'This page holds too many words. Shorten some.' }
    // Another page's address, checked inside the lock (so the reply is words, not a database error: security L1).
    const others = await tx.select({ id: shopPages.id, draft: shopPages.draft }).from(shopPages).where(eq(shopPages.tenantId, t))
    if (others.some((o) => o.id !== row.id && (o.draft as { handle?: string }).handle === draft.handle)) return { error: 'Another page has that address. Pick another.' }
    try {
      await tx.update(shopPages).set({ draft, version: row.version + 1, updatedAt: new Date() }).where(and(eq(shopPages.tenantId, t), eq(shopPages.id, row.id)))
    } catch (e) {
      // Drizzle wraps the database error: its code is on `cause` (offers/actions.ts does the same).
      const code = (e as { cause?: { code?: string } }).cause?.code
      if (code === '23505') return { error: 'Another page has that address. Pick another.' }
      if (code === '22P05') return { error: 'Some of these words can’t be saved. Retype them.' }
      throw e
    }
    return { version: row.version + 1 }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  return { ok: true, version: (r.value as { version: number }).version }
}

/** Remove a page: one never live goes now; a live one is removed at the next Publish (Undo brings it back). */
export async function removePageAction(input: unknown): Promise<R<{ gone: boolean; version?: number }>> {
  const p = z.object({ id: z.uuid(), version: z.number().int().positive() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Reload, then remove.' }
  const r = await asMember(CAN_BUILD, { action: 'page.remove' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    await lock(tx, t)
    const [row] = await tx.select().from(shopPages).where(and(eq(shopPages.tenantId, t), eq(shopPages.id, p.data.id))).for('update')
    if (!row || row.removedAt) return { gone: true }
    if (row.version !== p.data.version) return { error: 'This page changed in another window. Reload to see it.' }
    if (!row.live && !row.livePublishId) {
      await tx.delete(shopPages).where(and(eq(shopPages.tenantId, t), eq(shopPages.id, row.id)))
      return { gone: true }
    }
    const d = draftOf(row) ?? { title: TEMPLATE_NAMES[row.template as PageTemplate], handle: 'page', fill: {}, hidden: false }
    await tx.update(shopPages).set({ draft: { ...d, removed: true }, version: row.version + 1, updatedAt: new Date() }).where(and(eq(shopPages.tenantId, t), eq(shopPages.id, row.id)))
    return { gone: false, version: row.version + 1 }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  return { ok: true, ...(r.value as { gone: boolean; version?: number }) }
}
