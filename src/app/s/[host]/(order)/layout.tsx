import { BrandFrame } from '@/components/storefront/brand-frame'
import { OpeningSoon } from '@/components/storefront/pages'
import { ShopShell } from '@/components/storefront/shell'

import { shopTheme } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../_shop'
import { frameContent } from '../_frame'
import { brandLookFor } from '../_brand'

/** A shopper's order page: as the shop's pages, but open while the shop is paused (trials TR1·9) — an order already
 *  placed still finishes (pay again, switch to COD, track it). A code-site store's in its brand (one-address P2·3). */
export default async function OrderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const now = new Date()
  const b = await brandLookFor(shop, now)
  if (b) {
    const lang = shop.shopLanguage === 'hi' ? 'hi' : 'en'
    if (!shop.publishedAt) return <BrandFrame {...b} lang={lang}><OpeningSoon shop={shop} href={shopHref} /></BrandFrame>
    return <BrandFrame {...b} lang={lang} capture>{children}</BrandFrame>
  }
  const [theme, content] = await Promise.all([shopTheme(shop), frameContent(shop.id, now)])
  if (!shop.publishedAt) return <ShopShell shop={shop} href={shopHref} theme={theme} content={content} gated><OpeningSoon shop={shop} href={shopHref} /></ShopShell>
  return <ShopShell shop={shop} href={shopHref} theme={theme} content={content} live capture>{children}</ShopShell>
}
