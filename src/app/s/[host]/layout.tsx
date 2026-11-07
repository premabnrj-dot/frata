// A shop is cached: festive traffic must hit the CDN, not Postgres. Every
// segment is an ISR route (generateStaticParams returns none; each path is
// made on first visit and kept), refreshed by tag from the console or every 60 s.
export const revalidate = 60
export const generateStaticParams = () => []
// Pages read only their params (check:tenant 6c), so request APIs being empty here changes nothing; without this
// Next 15 rendered every shop page per request despite the empty generateStaticParams (tenancy audit 2026-11-07).
export const dynamic = 'force-static'

/** A shop's tabs are the shop's, never "… · Frata": this stops the root template (impact review U·2a). Its pages set
 * absolute titles ("Shop all | Kesar Studio"); the bag, checkout and order pages keep their plain ones. */
export const metadata = { title: { template: '%s', default: 'Shop' } }

export default function ShopRoot({ children }: { children: React.ReactNode }) {
  return children
}
