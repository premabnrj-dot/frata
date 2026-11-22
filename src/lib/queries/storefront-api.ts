import 'server-only'
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { shopSettings } from '@/lib/db/schema'
import { storefrontKeys } from '@/lib/db/schema-storefront-api'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { refreshKey } from '@/lib/storefront/refresh'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/queries/storefront-api.ts — THE STOREFRONT API'S OWN READS AND ONE BOOKKEEPING WRITE (V1 SA0·4).
//
// Each takes the shop from apiRequest's ctx (the key's definer row) or from the console's requireMember, never from a
// request. The catalogue itself is read through the shop's cached loaders (src/lib/queries/storefront.ts).
// =============================================================================

/** The shop's own website address, for a test key's CORS answer only (the shop resource reads `siteOrigin` from
 *  apiShop, tagged `shop:<t>:settings`). Uncached, its own transaction. */
export async function siteOriginFor(tenantId: string): Promise<string | null> {
  const [r] = await withTenant(tenantId, (tx) => tx.select({ o: shopSettings.siteOrigin }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)))
  return r?.o ?? null
}

/** The shop's website host for the source rule (classifySource's `site`), inside the caller's transaction: lower case,
 *  no scheme; null when the shop runs on Frrata. Explicit tenant filter beside the policy (tenancy audit SA1b). */
export async function siteHostIn(tx: Tx, tenantId: string): Promise<string | null> {
  const [r] = await tx.select({ o: shopSettings.siteOrigin }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
  return r?.o ? r.o.replace(/^https:\/\//, '') : null
}

/** Content › Pages' Preview on website (SA1b D·4): the store's live keys a preview may name (not deleted, not expired, a
 *  test key only while the store never opened), newest first. Names and shown prefixes only. */
export type PreviewKey = { id: string; name: string; prefix: string; lastSeenOn: string | null }
export async function previewKeysFor(tenantId: string): Promise<PreviewKey[]> {
  return withTenant(tenantId, (tx) => previewKeysIn(tx, tenantId))
}
/** The same list inside the caller's transaction (the console's Preview on website action signs with one of these). */
export async function previewKeysIn(tx: Tx, tenantId: string): Promise<PreviewKey[]> {
    const rows = await tx.execute<{ id: string; name: string; prefix: string; last_seen_on: string | Date | null }>(sql`
      select k.id, k.name, k.prefix, k.last_seen_on from storefront_keys k join tenants t on t.id = k.tenant_id
       where k.tenant_id = ${tenantId} and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())
         and (k.kind = 'public' or t.first_opened_at is null) and k.kind <> 'build'
       order by k.last_seen_on desc nulls last, k.created_at desc limit 20`)
    return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, lastSeenOn: r.last_seen_on === null ? null : String(r.last_seen_on instanceof Date ? r.last_seen_on.toISOString() : r.last_seen_on).slice(0, 10) }))
}

/** Today in India, as the date a key was last seen on. */
const istDay = (now: Date) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10)
const seen = new Map<string, string>()

/**
 * Notes that a key was used today, with which version (spec § 6: once per key per day, for sunsets). Called inline while
 * a copy is (re)built, which no shopper waits on (`after()` does not run on a background regeneration: speed review
 * M3); this instance skips it once done today, and the update is guarded so a second instance writes nothing new.
 * A failure is logged and never fails the read.
 */
export async function markKeySeen(ctx: { tenantId: string; keyId: string; version: string; now: Date }): Promise<void> {
  const day = istDay(ctx.now)
  const memo = `${day}:${ctx.version}`
  if (seen.get(ctx.keyId) === memo) return
  try {
    await withTenant(ctx.tenantId, (tx) => tx.update(storefrontKeys).set({ lastSeenOn: day, lastSeenVersion: ctx.version })
      .where(and(eq(storefrontKeys.id, ctx.keyId), eq(storefrontKeys.tenantId, ctx.tenantId),
        or(sql`${storefrontKeys.lastSeenOn} is distinct from ${day}::date`, sql`${storefrontKeys.lastSeenVersion} is distinct from ${ctx.version}`))))
    if (seen.size > 10_000) seen.clear()
    seen.set(ctx.keyId, memo)
  } catch (err) {
    console.error('[markKeySeen]', errName(err))
  }
}

/**
 * Purge every live key of a shop (its Website moved, or it opened: test keys stop by the definer, this drops their
 * cached copies too). At most MAX_LIVE_KEYS a shop. Build keys are never cached (looked up uncached), so none is here.
 */
export async function refreshKeys(tenantId: string): Promise<void> {
  try {
    const rows = await withTenant(tenantId, (tx) => tx.select({ hash: storefrontKeys.hash }).from(storefrontKeys)
      .where(and(eq(storefrontKeys.tenantId, tenantId), isNull(storefrontKeys.revokedAt), ne(storefrontKeys.kind, 'build'))))
    for (const r of rows) refreshKey(r.hash)
  } catch (err) {
    // Called after a write committed: a failed purge never turns it into a refusal (the hour's backstop covers it).
    console.error('[refreshKeys]', errName(err))
  }
}
