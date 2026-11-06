// A shop is cached: festive traffic must hit the CDN, not Postgres. Every
// segment is an ISR route (generateStaticParams returns none; each path is
// made on first visit and kept), refreshed by tag from the console or every 60 s.
export const revalidate = 60
export const generateStaticParams = () => []
// Pages read only their params (check:tenant 6c), so request APIs being empty here changes nothing; without this
// Next 15 rendered every shop page per request despite the empty generateStaticParams (tenancy audit 2026-11-07).
export const dynamic = 'force-static'

export default function ShopRoot({ children }: { children: React.ReactNode }) {
  return children
}
