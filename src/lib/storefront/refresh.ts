import 'server-only'
import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'

// What a shop's caches are told after a write (tags: shopCached in src/lib/queries/storefront.ts).

/** After a console write commits: the shop's pages read fresh rows. */
export function refreshShop(tenantId: string, scope: 'shop' | 'look' | 'catalogue' | 'videos' | 'pages') {
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
 * runs only if nobody purged in the new window first. If the instance is stopped before it fires, the 60 s backstop
 * covers it. Checkout always reads live stock and live uses, so a card that still shows the last piece sells nothing twice.
 * Returns what happened: purged `now`, a `trailing` purge queued, or `covered` by one already queued.
 */
const WINDOW_MS = LIMITS.soldOutPurge.windowSeconds * 1000
const lastSoldOut = new Map<string, number>()
const trailing = new Set<string>()
export async function refreshSoldOut(tenantId: string, now = Date.now(), t: Timing = realTiming): Promise<'now' | 'trailing' | 'covered'> { // clock-ok: server
  const last = lastSoldOut.get(tenantId) ?? Number.NEGATIVE_INFINITY
  if (now - last >= WINDOW_MS && await withinLimit(LIMITS.soldOutPurge, tenantId, new Date(now))) {
    lastSoldOut.set(tenantId, now)
    refreshShop(tenantId, 'catalogue')
    return 'now'
  }
  if (trailing.has(tenantId) || !(await withinLimit(LIMITS.soldOutTrail, tenantId, new Date(now)))) return 'covered'
  trailing.add(tenantId)
  // The later of this instance's 30 s and the shared window's end: both let a purge through then.
  const at = Math.max(last + WINDOW_MS, (Math.floor(now / WINDOW_MS) + 1) * WINDOW_MS)
  t.later(async () => {
    try {
      await t.wait(Math.max(0, at - t.clock()))
      const fire = t.clock()
      if (await withinLimit(LIMITS.soldOutPurge, tenantId, new Date(fire))) { lastSoldOut.set(tenantId, fire); refreshShop(tenantId, 'catalogue') }
    } finally { trailing.delete(tenantId) }
  })
  return 'trailing'
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
