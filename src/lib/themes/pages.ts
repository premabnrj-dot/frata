import 'server-only'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { shopPages } from '@/lib/db/schema-themes'
import { PageDraftSchema, type PageDraft, type PageTemplate } from '@/domains/pages/templates'

// =============================================================================
// FILE: src/lib/themes/pages.ts — a shop's pages inside the look's transaction (Theme Studio TS1a; plan § Decisions).
// Called by src/lib/themes/look.ts under its per-shop lock. A page reaches the shop only here, at the look's Publish:
// live := what the draft says (null when hidden or removed), previous := the old live, live_publish_id := that
// publish. Undo swaps live and previous for the pages that publish changed, under the Undo's own publish row, so a
// second Undo brings them back too. Every query names the tenant (and RLS holds it too).
// =============================================================================

export type PageRow = typeof shopPages.$inferSelect
/** What a page shows on the shop: its title, address and the owner's words. */
export type LivePage = { title: string; handle: string; fill: PageDraft['fill'] }

/** A draft as stored (parsed; a row that no longer parses counts as nothing to publish). */
export const draftOf = (row: Pick<PageRow, 'draft'>): PageDraft | null => { const r = PageDraftSchema.safeParse(row.draft); return r.success ? r.data : null }
/** What the draft would make live: null when hidden or removed. */
export const targetOf = (d: PageDraft | null): LivePage | null => (!d || d.hidden || d.removed ? null : { title: d.title, handle: d.handle, fill: d.fill })
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The shop's pages for the editor (not removed at a publish yet), oldest first. */
export async function pagesForEdit(tx: Tx, tenantId: string) {
  return tx.select().from(shopPages).where(and(eq(shopPages.tenantId, tenantId), isNull(shopPages.removedAt))).orderBy(shopPages.createdAt)
}

/** Pages whose draft differs from live, with the version each holds (Publish lists and checks them). */
export async function pendingPages(tx: Tx, tenantId: string): Promise<{ row: PageRow; target: LivePage | null; removed: boolean }[]> {
  const rows = await tx.select().from(shopPages).where(and(eq(shopPages.tenantId, tenantId), isNull(shopPages.removedAt))).for('update')
  return rows.flatMap((row) => { const d = draftOf(row); const target = targetOf(d); return same(target, row.live) && !d?.removed ? [] : [{ row, target, removed: !!d?.removed }] })
}

/** Below the 64 kB a shop's live pages may hold (bytes of the jsonb text; checked here, under the lock). */
export const MAX_LIVE_BYTES = 64_000

/**
 * The pages part of a Publish (look.ts, after its revision checks, before the publish row): refuses when a page the
 * editor didn't see changed (`versions`), or the live pages would pass 64 kB. Returns the step to run once the publish
 * row exists.
 */
export async function preparePages(tx: Tx, tenantId: string, versions: Record<string, number> | undefined): Promise<'stale' | 'too_long' | ((publishId: string) => Promise<void>)> {
  const pending = await pendingPages(tx, tenantId)
  if (versions && pending.some((p) => !Object.hasOwn(versions, p.row.id) || versions[p.row.id] !== p.row.version)) return 'stale'
  const sizes = await tx.select({ id: shopPages.id, bytes: sql<number>`octet_length(${shopPages.live}::text)` }).from(shopPages)
    .where(and(eq(shopPages.tenantId, tenantId), isNotNull(shopPages.live), isNull(shopPages.removedAt)))
  const changing = new Set(pending.map((p) => p.row.id))
  const bytes = sizes.reduce((n, r) => n + (changing.has(r.id) ? 0 : Number(r.bytes)), 0)
  const adding = pending.reduce((n, p) => n + (p.target ? new TextEncoder().encode(JSON.stringify(p.target)).length * 1.1 : 0), 0)
  if (Number(bytes) + adding > MAX_LIVE_BYTES) return 'too_long'
  return async (publishId) => {
    const now = new Date()
    // Pages removed at an earlier publish are gone for good now (Undo reaches only the last publish).
    await tx.delete(shopPages).where(and(eq(shopPages.tenantId, tenantId), isNotNull(shopPages.removedAt)))
    for (const p of pending) {
      await tx.update(shopPages).set({ previous: p.row.live, live: p.target, livePublishId: publishId, removedAt: p.removed ? now : null, updatedAt: now })
        .where(and(eq(shopPages.tenantId, tenantId), eq(shopPages.id, p.row.id)))
    }
  }
}

/** Undo: the pages the undone publish changed go back (live ↔ previous), under the Undo's own publish row. */
export async function undoPages(tx: Tx, tenantId: string, undone: string, undoPublishId: string) {
  // A page that publish removed comes back too (removed_at cleared); one it added goes back to nothing live.
  await tx.execute(sql`update ${shopPages} set live = previous, previous = live, live_publish_id = ${undoPublishId}, removed_at = null, updated_at = now()
    where tenant_id = ${tenantId} and live_publish_id = ${undone}`)
}

/** Discard: every page's draft goes back to what is live; a page never published goes. */
export async function discardPages(tx: Tx, tenantId: string) {
  await tx.delete(shopPages).where(and(eq(shopPages.tenantId, tenantId), isNull(shopPages.live), isNull(shopPages.livePublishId)))
  const rows = await tx.select().from(shopPages).where(and(eq(shopPages.tenantId, tenantId), isNull(shopPages.removedAt)))
  for (const r of rows) {
    const live = r.live as LivePage | null, d = draftOf(r)
    const back: PageDraft = live ? { ...live, hidden: false } : { title: d?.title ?? 'Page', handle: d?.handle ?? 'page', fill: d?.fill ?? {}, hidden: true }
    if (!same(back, d)) await tx.update(shopPages).set({ draft: back, version: r.version + 1, updatedAt: new Date() }).where(and(eq(shopPages.tenantId, tenantId), eq(shopPages.id, r.id)))
  }
}

export type { PageTemplate }
