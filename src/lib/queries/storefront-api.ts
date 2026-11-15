import 'server-only'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
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

/** The shop's own website address: a test key's CORS answer, and `siteOrigin` in the shop resource (the cached copy
 *  takes it at render, so whatever sets it must purge the keys: refreshKeys). Uncached, its own transaction. */
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
 * cached copies too). At most MAX_LIVE_KEYS a shop.
 */
export async function refreshKeys(tenantId: string): Promise<void> {
  try {
    const rows = await withTenant(tenantId, (tx) => tx.select({ hash: storefrontKeys.hash }).from(storefrontKeys)
      .where(and(eq(storefrontKeys.tenantId, tenantId), isNull(storefrontKeys.revokedAt))))
    for (const r of rows) refreshKey(r.hash)
  } catch (err) {
    // Called after a write committed: a failed purge never turns it into a refusal (the hour's backstop covers it).
    console.error('[refreshKeys]', errName(err))
  }
}
