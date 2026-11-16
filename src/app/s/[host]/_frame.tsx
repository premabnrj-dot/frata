import 'server-only'
import { OpeningSoon } from '@/components/storefront/pages'
import { ShopShell } from '@/components/storefront/shell'
import { AnnounceBar, offerBarLive } from '@/components/storefront/announce-bar'
import { shellContentOf } from '@/domains/content/bar'
import { shopContent } from '@/lib/queries/content'
import { shopAnnouncement, shopCatalogue } from '@/lib/queries/storefront'
import { pausedAt } from '@/lib/queries/trial-pause'
import { shellNeedsCatalogue, shellPictures, shopTheme } from '@/lib/themes/page-look'
import { shopFor, shopHref } from './_shop'

/**
 * Every shop page's frame (the (shop) and (checkout) layouts): the shop's published look; "Opening soon" until the
 * shop publishes, or while it is paused. The checkout asks for `checkout`: a theme whose checkout is Focused then
 * shows the logo and the legal footer only (2.0 choice; plan 2026-11-09-themes-three, review finding 10).
 */
export async function ShopFrame({ children, params, checkout = false }: { children: React.ReactNode; params: Promise<{ host: string }>; checkout?: boolean }) {
  const shop = await shopFor(params)
  const now = new Date()
  // The look, the store's content (V1) and the offer in the bar load together (no serial round trip). The offer and
  // the content each fail quietly: no bar, the default menus, never an error page.
  const [theme, content, announce] = await Promise.all([shopTheme(shop), shopContent(shop.id).catch(() => null), shopAnnouncement(shop.id).catch(() => null)])
  if (!shop.publishedAt) return <ShopShell shop={shop} href={shopHref} theme={theme} content={shellContentOf(content, false, now)} gated><OpeningSoon shop={shop} href={shopHref} /></ShopShell>
  // Trials TR1·9: paused for no autopay after the trial — no new orders (orders already placed carry on).
  if (pausedAt(shop.pause, now)) return <ShopShell shop={shop} href={shopHref} theme={theme} content={shellContentOf(content, false, now)} gated><OpeningSoon shop={shop} href={shopHref} paused /></ShopShell>
  const focused = checkout && theme.settings.checkout === 'focused'
  const { circles, strip } = shellPictures(theme, shellNeedsCatalogue(theme) && !focused ? await shopCatalogue(shop.id) : null, now)
  // One bar, never two (src/domains/content/bar.ts): a live offer in the bar first (offers O·1), else the store's
  // written bar that started last.
  const offerLive = !focused && offerBarLive(announce, now)
  return <ShopShell shop={shop} href={shopHref} theme={theme} content={shellContentOf(content, offerLive, now)} circles={circles} strip={strip} live capture focused={focused} banner={offerLive ? <AnnounceBar a={announce} now={now} /> : undefined}>{children}</ShopShell>
}

/** A store page outside the frame (its order pages, the policies): its content with the written bar (no offer read). */
export async function frameContent(shopId: string, now: Date) {
  return shellContentOf(await shopContent(shopId).catch(() => null), false, now)
}
