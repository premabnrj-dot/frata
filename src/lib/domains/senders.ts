import 'server-only'
import { sql } from 'drizzle-orm'
import { addDomain, removeDomain } from '@/lib/connectors/vercel'
import { withTenant } from '@/lib/db/tenant'
import type { OutboxRow } from '@/lib/outbox'

// =============================================================================
// FILE: src/lib/domains/senders.ts — THE OUTBOX SENDERS FOR OWN DOMAINS (D2·4). Registered in src/lib/outbox/drain.ts.
// A row is written by app_domain_record's caller only after the shop's own proof; the call is made outside any
// transaction, and its outcome is written by app_domain_added inside the shop's own.
// =============================================================================

/** Outbox `domain.add`: put a proved host (and its www, sent to it) on the project, then record what Vercel said. */
export async function sendDomainAdd(row: OutboxRow): Promise<void> {
  const id = (row.payload as { id?: string }).id
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('domain.add without its row')
  // Re-read: only a row still this shop's, proved, live and not yet added (removed meanwhile → nothing to add).
  const [p] = await withTenant(row.tenantId, (tx) => tx.execute<{ host: string; www: string | null }>(sql`select * from app_domain_add_due(${id}::uuid)`))
  if (!p) return
  const main = await addDomain(p.host)
  if (!main.ok && main.why !== 'other_account') throw new Error(`domain.add: ${main.why}`)
  if (main.ok && p.www) {
    const w = await addDomain(p.www, p.host)
    if (!w.ok && w.why !== 'other_account') throw new Error(`domain.add www: ${w.why}`)
  }
  await withTenant(row.tenantId, (tx) => tx.execute(sql`select app_domain_added(${id}::uuid, ${main.ok}, ${main.ok ? null : main.vercelTxt})`))
}

/** Outbox `domain.remove` (D2·7): take a parked host off the project — unless another shop now holds it live. */
export async function sendDomainRemove(row: OutboxRow): Promise<void> {
  const id = (row.payload as { id?: string }).id
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('domain.remove without its row')
  const [p] = await withTenant(row.tenantId, (tx) => tx.execute<{ host: string; www: string | null; keep_host: boolean; keep_www: boolean }>(sql`select * from app_domain_remove_due(${id}::uuid)`))
  if (!p) return
  // Off the project: every host of this row that no other live row holds now (a move keeps exactly what moved).
  const off = [...(p.keep_host ? [] : [p.host]), ...(p.www && !p.keep_www ? [p.www] : [])]
  for (const h of off) {
    if ((await removeDomain(h)) === 'error') throw new Error('domain.remove: vercel')
  }
  await withTenant(row.tenantId, (tx) => tx.execute(sql`select app_domain_unparked(${id}::uuid)`))
}
