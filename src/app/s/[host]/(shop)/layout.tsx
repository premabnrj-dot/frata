import { SiteMove } from '@/components/storefront/site-move'
import { siteMoveScript } from '@/domains/addresses/names'
import { pausedAt } from '@/lib/queries/trial-pause'
import { ShopFrame } from '../_frame'
import { shopFor } from '../_shop'

/**
 * Every shop page but the checkout, the orders and the policies: the shop's published look (ShopFrame). When the brand's
 * own website runs elsewhere and the store is open (SA1b, owner 2026-11-15), its home, product and collection pages move
 * the shopper there in the browser, keeping the link's tags: an inline script first (before paint; the shop's CSP has no
 * script-src), then SiteMove on soft navigations. The bag stays here.
 */
export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const move = shop.siteOrigin && shop.publishedAt && !pausedAt(shop.pause, new Date()) ? shop.siteOrigin : null
  return (
    <>
      {move ? <script dangerouslySetInnerHTML={{ __html: siteMoveScript(move) }} /> : null}
      {move ? <SiteMove origin={move} /> : null}
      <ShopFrame params={params}>{children}</ShopFrame>
    </>
  )
}
