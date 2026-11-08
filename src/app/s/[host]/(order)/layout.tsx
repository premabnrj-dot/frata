import { OpeningSoon } from '@/components/storefront/pages'
import { ShopShell } from '@/components/storefront/shell'
import { shopLook } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../_shop'

/** A shopper's order page: as the shop's pages, but open while the shop is paused (trials TR1·9) — an order already
 *  placed still finishes (pay again, switch to COD, track it). */
export default async function OrderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  if (!shop.publishedAt) return <ShopShell shop={shop} href={shopHref} theme={theme} gated><OpeningSoon shop={shop} href={shopHref} /></ShopShell>
  return <ShopShell shop={shop} href={shopHref} theme={theme} live capture>{children}</ShopShell>
}
