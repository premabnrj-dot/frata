import 'server-only'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { arrayParam } from '@/lib/db/sql-array'

// =============================================================================
// FILE: src/lib/catalogue/photos-in-use.ts
//
// A PRODUCT PHOTO SOMETHING ELSE STILL SHOWS keeps its files when its row goes (security review 2026-11-09): a look's
// settings (Look v3, "From your products"), a product's stories (Signal S3), or a page's draft, live or restorable
// copy (TS1a). Read inside the caller's tenant transaction, one statement for any number of photos. Removing a photo
// (editPhoto) and deleting an import's drafts both ask here.
// =============================================================================

/** Which of `bases` are still shown somewhere in the shop; `leaving` are products about to be deleted (their own stories don't count). */
export async function photosInUse(tx: Tx, tenantId: string, bases: readonly string[], leaving: readonly string[] = []): Promise<Set<string>> {
  if (!bases.length) return new Set()
  const rows = await tx.execute<{ base: string }>(sql`
    select b.base from unnest(${arrayParam([...bases], 'text')}) as b(base)
    where exists (select 1 from shop_theme_revisions r where r.tenant_id = ${tenantId} and position(b.base in r.settings::text) > 0)
       or exists (select 1 from products p where p.tenant_id = ${tenantId} and p.id <> all(${arrayParam([...leaving], 'uuid')}) and position(b.base in p.stories::text) > 0)
       or exists (select 1 from shop_pages g where g.tenant_id = ${tenantId}
                  and position(b.base in (g.draft::text || coalesce(g.live::text, '') || coalesce(g.previous::text, ''))) > 0)`)
  return new Set(rows.map((r) => r.base))
}
