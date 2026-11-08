import 'server-only'
import { revalidateTag } from 'next/cache'

// What a shop's caches are told after a write (tags: shopCached in src/lib/queries/storefront.ts).

/** After a console write commits: the shop's pages read fresh rows. */
export function refreshShop(tenantId: string, scope: 'shop' | 'catalogue') {
  revalidateTag(scope === 'shop' ? `shop:${tenantId}` : `shop:${tenantId}:catalogue`)
}
/**
 * A shopper's order sold something out (speed review P11). Each refresh rebuilds the whole catalogue and every product
 * page, so at a festive drop one per sell-out kept the shop uncached: at most one per shop every 30 s from this
 * instance. Checkout always reads live stock, so a card that still shows the last piece for 30 s sells nothing twice.
 */
const lastSoldOut = new Map<string, number>()
export function refreshSoldOut(tenantId: string, now = Date.now()) {
  if (now - (lastSoldOut.get(tenantId) ?? 0) < 30_000) return false
  lastSoldOut.set(tenantId, now)
  refreshShop(tenantId, 'catalogue')
  return true
}
/** After an address change or a new shop: the host lookups for both addresses. */
export function refreshHosts(...hosts: string[]) {
  for (const h of hosts) revalidateTag(`host:${h}`)
}
