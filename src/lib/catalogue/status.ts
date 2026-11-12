import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import type { Status } from '@/domains/catalogue/availability'
import type { Tx } from '@/lib/db'
import { products } from '@/lib/db/schema-catalogue'
import { arrayParam } from '@/lib/db/sql-array'
import { goLive, readinessIn } from './readiness'

// =============================================================================
// FILE: src/lib/catalogue/status.ts
//
// CHANGING PRODUCTS' STATUS — the one function behind the editor's status, the list's Set status and Archive, and
// their Undo (products PR·1 plan), inside the caller's tenant transaction. Rows are locked in id order (saveProduct
// locks its row too, so a draft's blank prices can't land on a product just made live). Going live needs the
// readiness list for each (readiness.ts); one that isn't ready is left as it was and named with what it needs.
// `before` is what each changed row was, for Undo (a schedule still to come is part of it).
// =============================================================================

export type Before = { id: string; status: Status; publishAt: string | null }
export type StatusResult = { changed: { id: string; title: string }[]; refused: { id: string; title: string; needs: string[] }[]; before: Before[] }

export async function setStatusIn(tx: Tx, tenantId: string, ids: readonly string[], status: Status, when: Date | null, now: Date): Promise<StatusResult> {
  if (!ids.length) return { changed: [], refused: [], before: [] }
  const rows = await tx.select({ id: products.id, title: products.title, status: products.status, publishAt: products.publishAt }).from(products)
    .where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${arrayParam([...ids], 'uuid')})`)).orderBy(products.id).for('update')
  // A row already as asked (same status, same moment) is left alone: re-archiving would move its archived date.
  const same = (r: (typeof rows)[number]) => r.status === status && (r.publishAt?.getTime() ?? null) === (when?.getTime() ?? null)
  const live = status === 'active' || status === 'unlisted'
  const refused: StatusResult['refused'] = []
  let ok = rows.filter((r) => !same(r))
  if (live && ok.length) {
    const facts = await readinessIn(tx, tenantId, ok.map((r) => r.id), now)
    ok = ok.filter((r) => {
      const needs = facts.get(r.id)?.readiness.filter((x) => !x.ok).map((x) => x.label.toLowerCase()) ?? []
      if (needs.length) refused.push({ id: r.id, title: r.title, needs })
      return !needs.length
    })
  }
  const okIds = ok.map((r) => r.id)
  if (okIds.length) {
    if (live) await goLive(tx, tenantId, okIds, now, { status, at: when })
    else await tx.update(products).set({ status, publishAt: null, archivedAt: status === 'archived' ? now : null, updatedAt: now })
      .where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${arrayParam(okIds, 'uuid')})`))
  }
  return {
    changed: ok.map((r) => ({ id: r.id, title: r.title })), refused,
    before: ok.map((r) => ({ id: r.id, status: r.status as Status, publishAt: r.publishAt ? r.publishAt.toISOString() : null })),
  }
}
