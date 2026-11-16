import 'server-only'
import { shopPages } from '@/lib/db/schema-themes'
import { PageDraftSchema, type PageDraft } from '@/domains/pages/templates'

// =============================================================================
// FILE: src/lib/themes/pages.ts — a store's page rows, read the same way everywhere (Theme Studio TS1a). Since V1
// content a page saves live from Console › Content (src/app/(console)/console/content/actions.ts): draft := the words,
// live := what shoppers see (null while hidden), previous := the entry before the last save (Undo). Never with the look.
// =============================================================================

export type PageRow = typeof shopPages.$inferSelect
/** What a page shows on the shop: its title, address and the owner's words. */
export type LivePage = { title: string; handle: string; fill: PageDraft['fill'] }

/** A draft as stored (parsed; a row that no longer parses counts as nothing to publish). */
export const draftOf = (row: Pick<PageRow, 'draft'>): PageDraft | null => { const r = PageDraftSchema.safeParse(row.draft); return r.success ? r.data : null }
/** What the draft would make live: null when hidden or removed. */
export const targetOf = (d: PageDraft | null): LivePage | null => (!d || d.hidden || d.removed ? null : { title: d.title, handle: d.handle, fill: d.fill })
/** JSON with its keys sorted: Postgres's jsonb hands keys back in its own order, so a plain stringify of a live page
 *  never equals its draft's (impact review 2026-11-11 HIGH). */
export const canon = (x: unknown): string => JSON.stringify(x ?? null, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v))

/** Below the 64 kB a store's shown pages may hold together (bytes of the jsonb text; checked at a page save). */
export const MAX_LIVE_BYTES = 64_000

/** A page's address, once it exists: set when it is added (or as it was when pages saved with the look) and never
 *  moved, so a link to it never breaks. The one rule: the content actions keep it, the editor shows it as fixed. */
export const fixedHandle = (row: Pick<PageRow, 'draft'>): string | null => draftOf(row)?.handle ?? null
