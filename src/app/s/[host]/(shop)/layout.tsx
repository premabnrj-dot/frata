import { OpeningSoon } from '@/components/storefront/pages'
import { ShopShell } from '@/components/storefront/shell'
import { shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { circlesOf, themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../_shop'

/** Every shop page but the policies: the shop's published look; "Opening soon" until the shop publishes. */
export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  if (!shop.publishedAt) return <ShopShell shop={shop} href={shopHref} theme={theme} gated><OpeningSoon shop={shop} href={shopHref} /></ShopShell>
  const circles = theme.settings.header === 'circles' ? circlesOf(await shopCatalogue(shop.id), new Date()) : []
  return <ShopShell shop={shop} href={shopHref} theme={theme} circles={circles} live>{children}</ShopShell>
}
