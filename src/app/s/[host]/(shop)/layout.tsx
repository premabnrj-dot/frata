import { OpeningSoon } from '@/components/storefront/pages'
import { ShopShell } from '@/components/storefront/shell'
import { AnnounceBar } from '@/components/storefront/announce-bar'
import { shopAnnouncement, shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { circlesOf, themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../_shop'

/** Every shop page but the policies: the shop's published look; "Opening soon" until the shop publishes. */
export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  if (!shop.publishedAt) return <ShopShell shop={shop} href={shopHref} theme={theme} gated><OpeningSoon shop={shop} href={shopHref} /></ShopShell>
  const circles = theme.settings.header === 'circles' ? circlesOf(await shopCatalogue(shop.id), new Date()) : []
  // The offer the merchant put in the bar (offers O·1); a read that fails shows no bar, never an error page. A live
  // offer takes the bar's place; without one, the theme's own announcement (Look › Header) shows. One bar, never two.
  const announce = await shopAnnouncement(shop.id).catch(() => null)
  return <ShopShell shop={shop} href={shopHref} theme={theme} circles={circles} live banner={announce ? <AnnounceBar a={announce} now={new Date()} /> : undefined}>{children}</ShopShell>
}
