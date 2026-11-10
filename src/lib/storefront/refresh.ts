import 'server-only'
import { revalidateTag } from 'next/cache'

// What a shop's caches are told after a write (tags: shopCached in src/lib/queries/storefront.ts).

/** After a console write commits: the shop's pages read fresh rows. */
export function refreshShop(tenantId: string, scope: 'shop' | 'catalogue' | 'videos') {
  revalidateTag(scope === 'shop' ? `shop:${tenantId}` : `shop:${tenantId}:${scope}`)
}
/**
 * A shopper's order sold something out (speed review P11). Each refresh rebuilds the whole catalogue and every product
 * page, so at a festive drop one per sell-out kept the shop uncached: at most one per shop every 30 s from this
 * instance. Checkout always reads live stock, so a card that still shows the last piece (up to the 60 s backstop) sells nothing twice.
 */
const lastSoldOut = new Map<string, number>()
export function refreshSoldOut(tenantId: string, now = Date.now()) {
  if (now - (lastSoldOut.get(tenantId) ?? 0) < 30_000) return false
  lastSoldOut.set(tenantId, now)
  refreshShop(tenantId, 'catalogue')
  return true
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
