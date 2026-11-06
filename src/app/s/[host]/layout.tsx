// A shop is cached: festive traffic must hit the CDN, not Postgres. Every
// segment is an ISR route (generateStaticParams returns none; each path is
// made on first visit and kept), refreshed by tag from the console or every 60 s.
export const revalidate = 60
export const generateStaticParams = () => []

export default function ShopRoot({ children }: { children: React.ReactNode }) {
  return children
}
