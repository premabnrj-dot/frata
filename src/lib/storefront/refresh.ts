import 'server-only'
import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { LIMITS, withinLimit, type Limit } from '@/lib/db/rate-limit'

// What a shop's caches are told after a write (tags: shopCached in src/lib/queries/storefront.ts).

/** After a console write commits: the shop's pages read fresh rows. */
export function refreshShop(tenantId: string, scope: 'shop' | 'look' | 'catalogue' | 'videos' | 'pages' | 'content') {
  revalidateTag(scope === 'shop' ? `shop:${tenantId}` : `shop:${tenantId}:${scope}`)
}

/** How a trailing purge waits (injected by tests): `later` runs work after the response, `wait` sleeps, `clock` reads ms. */
export type Timing = { later: (work: () => Promise<void>) => void; wait: (ms: number) => Promise<void>; clock: () => number }
const realTiming: Timing = {
  // after(): the instance stays up past the response for the wait (≤ 30 s). Outside a request (a script) it just runs.
  later: (work) => { try { after(work) } catch { void work() } },
  wait: (ms) => new Promise((res) => setTimeout(res, ms)),
  clock: () => Date.now(), // clock-ok: server timer, never rendered
}

/**
 * A shopper's order sold something out, or used an offer up (speed review P11). Each refresh rebuilds the whole
 * catalogue and every product page, so at a festive drop one per sell-out kept the shop uncached: at most one per shop
 * every 30 s — from this instance (no database read), and across every instance (one limiter row; speed review
 * 2026-11-11: 10 instances purged 10 times). A sell-out inside a window already purged is not dropped (shopper batch
 * 2026-11-12): it queues ONE trailing purge at the window's end, per shop, on one instance (limiter `soldOutTrail`), which
 * runs only if nobody purged in the new window first, and only when it can fire within the route's time (else, and if
 * the instance is stopped before it fires, the 60 s backstop covers it). Checkout always reads live stock and live uses, so a card that still shows the last piece sells nothing twice.
 * Returns what happened: purged `now`, a `trailing` purge queued, or `covered` by one already queued.
 */
const WINDOW_MS = LIMITS.soldOutPurge.windowSeconds * 1000
/** The longest a trailer may wait: the routes that sell run for at most 30 s (maxDuration) and after() counts in it, so a
 * longer wait would be cut off while its limiter row still told every other instance a trailer was coming (impact
 * review 2026-11-12). A sell-out that would need longer is left to the 60 s backstop. */
const TRAIL_BUDGET_MS = 25_000
/** A purge held to once per store every 30 s across every instance, with one trailing purge, never dropped while it
 * can fire in time: its two limiter rows and the cache scope it purges. Shared by sell-outs and content saves. */
type Throttle = { scope: 'catalogue' | 'content'; purge: Limit; trail: Limit }
const lastPurge = new Map<string, number>()
/** Until when this instance knows the shared window is used (by another instance) or a trailer is queued: no limiter
 * write before then (impact review 2026-11-12: every sell-out wrote both rows while another instance held the window). */
const usedUntil = new Map<string, number>()
const coveredUntil = new Map<string, number>()
const trailing = new Set<string>()
async function throttledPurge(th: Throttle, tenantId: string, now: number, t: Timing): Promise<'now' | 'trailing' | 'covered'> {
  const k = `${th.scope}:${tenantId}`
  const last = lastPurge.get(k) ?? Number.NEGATIVE_INFINITY
  const windowEnd = (Math.floor(now / WINDOW_MS) + 1) * WINDOW_MS
  if (now - last >= WINDOW_MS && now >= (usedUntil.get(k) ?? 0)) {
    if (await withinLimit(th.purge, tenantId, new Date(now))) {
      lastPurge.set(k, now)
      refreshShop(tenantId, th.scope)
      return 'now'
    }
    usedUntil.set(k, windowEnd)
  }
  if (trailing.has(k) || now < (coveredUntil.get(k) ?? 0)) return 'covered'
  // The later of this instance's 30 s and the shared window's end: both let a purge through then.
  const at = Math.max(last + WINDOW_MS, windowEnd)
  if (at - now > TRAIL_BUDGET_MS) return 'covered'
  if (!(await withinLimit(th.trail, tenantId, new Date(now)))) { coveredUntil.set(k, windowEnd); return 'covered' }
  trailing.add(k)
  t.later(async () => {
    try {
      await t.wait(Math.max(0, at - t.clock()))
      const fire = t.clock()
      if (await withinLimit(th.purge, tenantId, new Date(fire))) { lastPurge.set(k, fire); refreshShop(tenantId, th.scope) }
    } finally { trailing.delete(k) }
  })
  return 'trailing'
}
export function refreshSoldOut(tenantId: string, now = Date.now(), t: Timing = realTiming): Promise<'now' | 'trailing' | 'covered'> { // clock-ok: server
  return throttledPurge({ scope: 'catalogue', purge: LIMITS.soldOutPurge, trail: LIMITS.soldOutTrail }, tenantId, now, t)
}
/**
 * A content save (V1, plan docs/plans/2026-11-15-v1-content.md): the bar, a menu or the Contact line is on every page, so
 * a save purges `shop:<t>:content` — the first in a window at once, repeats in one trailing purge. What a trailer can't
 * cover in time is left to the entry's 60 s backstop. Page words purge `pages` only (refreshShop).
 */
export function refreshContent(tenantId: string, now = Date.now(), t: Timing = realTiming): Promise<'now' | 'trailing' | 'covered'> { // clock-ok: server
  return throttledPurge({ scope: 'content', purge: LIMITS.contentPurge, trail: LIMITS.contentTrail }, tenantId, now, t)
}
/**
 * Reviews (R1, speed review 4): a shopper's published review purges its product only (card stars catch up on the 60 s
 * backstop); an owner's action purges the product and the shop's ratings at once.
 */
export function refreshReviews(tenantId: string, productId: string, shopWide: boolean) {
  revalidateTag(`shop:${tenantId}:reviews:${productId}`)
  if (shopWide) revalidateTag(`shop:${tenantId}:reviews`)
}
/** PV·1: one product's own entry (its video turned playable, went, or its cover changed), never the catalogue. */
export function refreshProduct(tenantId: string, handle: string) {
  revalidateTag(`shop:${tenantId}:product:${handle}`)
}
/** After an address change or a new shop: the host lookups for both addresses. */
export function refreshHosts(...hosts: string[]) {
  for (const h of hosts) revalidateTag(`host:${h}`)
}
