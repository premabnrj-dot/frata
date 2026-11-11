import type { Metadata, Viewport } from 'next'
import { MovedTo } from '@/components/storefront/moved-to'
import { shopHostParam } from '@/domains/tenancy/host'
import { isDatabaseConfigured } from '@/lib/env'
import { shopMovedTo } from '@/lib/queries/storefront'
import { iconContent, iconPath } from '@/lib/seo/icon'
import { shopTheme } from '@/lib/themes/page-look'
import { shopForRoute } from './_shop'

// A shop is cached: festive traffic must hit the CDN, not Postgres. Every
// segment is an ISR route (generateStaticParams returns none; each path is
// made on first visit and kept), refreshed by tag from the console or every 60 s.
export const revalidate = 60
export const generateStaticParams = () => []
// Pages read only their params (check:tenant 6c), so request APIs being empty here changes nothing; without this
// Next 15 rendered every shop page per request despite the empty generateStaticParams (tenancy audit 2026-11-07).
export const dynamic = 'force-static'

/** A shop's tabs are the shop's, never "… · Frrata": this stops the root template (impact review U·2a). Its pages set
 * absolute titles ("Shop all | Kesar Studio"); the bag, checkout and order pages keep their plain ones. */
// The shop's own icon (search and sharing S1·6): its logo or initial, never Frrata's mark (brand spec). No description:
// Frrata's own (root layout) would otherwise reach a shop's share cards (impact review S1·1).
export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const base: Metadata = { title: { template: '%s', default: 'Shop' }, description: null, icons: { icon: 'data:,' } }
  const shop = await shopForRoute(params).catch(() => null)
  if (!shop) return base
  const c = iconContent(shop, (await shopTheme(shop)))
  return { ...base, icons: { icon: [{ url: iconPath(c, 32), sizes: '32x32', type: 'image/png' }, { url: iconPath(c, 192), sizes: '192x192', type: 'image/png' }], apple: [{ url: iconPath(c, 180), sizes: '180x180' }] } }
}
export async function generateViewport({ params }: { params: Promise<{ host: string }> }): Promise<Viewport> {
  const shop = await shopForRoute(params).catch(() => null)
  return shop ? { themeColor: (await shopTheme(shop)).schemes.paper.bg } : {}
}

/** A shop's old name leads to its current one (shop addresses D·1): see MovedTo. */
export default async function ShopRoot({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const host = shopHostParam((await params).host)
  const to = host && isDatabaseConfigured() ? await shopMovedTo(host).catch(() => null) : null
  return to ? <MovedTo to={to}>{children}</MovedTo> : children
}
