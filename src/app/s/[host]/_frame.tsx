import 'server-only'
import { OpeningSoon } from '@/components/storefront/pages'
import { ShopShell } from '@/components/storefront/shell'
import { AnnounceBar } from '@/components/storefront/announce-bar'
import { shopAnnouncement, shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { pausedAt } from '@/lib/queries/trial-pause'
import { shellNeedsCatalogue, shellPictures, themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from './_shop'

/**
 * Every shop page's frame (the (shop) and (checkout) layouts): the shop's published look; "Opening soon" until the
 * shop publishes, or while it is paused. The checkout asks for `checkout`: a theme whose checkout is Focused then
 * shows the logo and the legal footer only (2.0 choice; plan 2026-11-09-themes-three, review finding 10).
 */
export async function ShopFrame({ children, params, checkout = false }: { children: React.ReactNode; params: Promise<{ host: string }>; checkout?: boolean }) {
  const shop = await shopFor(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  if (!shop.publishedAt) return <ShopShell shop={shop} href={shopHref} theme={theme} gated><OpeningSoon shop={shop} href={shopHref} /></ShopShell>
  // Trials TR1·9: paused for no autopay after the trial — no new orders (orders already placed carry on).
  if (pausedAt(shop.pause, new Date())) return <ShopShell shop={shop} href={shopHref} theme={theme} gated><OpeningSoon shop={shop} href={shopHref} paused /></ShopShell>
  const focused = checkout && theme.settings.checkout === 'focused'
  const { circles, strip } = shellPictures(theme, shellNeedsCatalogue(theme) && !focused ? await shopCatalogue(shop.id) : null, new Date())
  // The offer the merchant put in the bar (offers O·1); a read that fails shows no bar, never an error page. A live
  // offer takes the bar's place; without one, the theme's own announcement (Look › Header) shows. One bar, never two.
  const announce = focused ? null : await shopAnnouncement(shop.id).catch(() => null)
  return <ShopShell shop={shop} href={shopHref} theme={theme} circles={circles} strip={strip} live capture focused={focused} banner={announce ? <AnnounceBar a={announce} now={new Date()} /> : undefined}>{children}</ShopShell>
}
