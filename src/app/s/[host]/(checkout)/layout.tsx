import { BrandFrame } from '@/components/storefront/brand-frame'
import { OpeningSoon } from '@/components/storefront/pages'
import { pausedAt } from '@/lib/queries/trial-pause'
import { ShopFrame } from '../_frame'
import { brandLookFor } from '../_brand'
import { shopFor, shopHref } from '../_shop'

/**
 * The checkout: a code-site store's in its brand (one-address P2·3: the record and the checkout design, never the
 * theme); a theme shop's in its look, focused when the theme's checkout is Focused (ShopFrame). No page entrance here.
 */
export default async function CheckoutLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const now = new Date()
  const b = await brandLookFor(shop, now)
  if (!b) return <ShopFrame params={params} checkout>{children}</ShopFrame>
  const lang = shop.shopLanguage === 'hi' ? 'hi' : 'en'
  // Not open yet, or paused for no autopay after a trial (TR1·9): no new orders, as on a theme shop.
  if (!shop.publishedAt || pausedAt(shop.pause, now)) return <BrandFrame {...b} lang={lang}><OpeningSoon shop={shop} href={shopHref} paused={!!shop.publishedAt} /></BrandFrame>
  return <BrandFrame {...b} lang={lang} capture>{children}</BrandFrame>
}
