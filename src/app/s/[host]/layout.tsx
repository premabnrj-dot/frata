import { MovedTo } from '@/components/storefront/moved-to'
import { shopHostParam } from '@/domains/tenancy/host'
import { isDatabaseConfigured } from '@/lib/env'
import { shopMovedTo } from '@/lib/queries/storefront'

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
// No platform icon on a shop's tab (brand spec): an empty icon until shops get their own favicon.
export const metadata = { title: { template: '%s', default: 'Shop' }, icons: { icon: 'data:,' } }

/** A shop's old name leads to its current one (shop addresses D·1): see MovedTo. */
export default async function ShopRoot({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const host = shopHostParam((await params).host)
  const to = host && isDatabaseConfigured() ? await shopMovedTo(host) : null
  return to ? <MovedTo to={to}>{children}</MovedTo> : children
}
