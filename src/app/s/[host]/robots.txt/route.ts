import { shopForRoute } from '../_shop'

// Not force-static: a 404 for an unknown host must never be cached (tenancy audit 2026-11-07). The rows are
// cached by the loaders; the CDN keeps a real shop's answer five minutes.
export const dynamic = 'force-dynamic'

/** A shop that is opening soon asks not to be crawled; an open one points at its sitemap. */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const shop = await shopForRoute(params)
  if (!shop) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  const body = shop.publishedAt ? `User-agent: *\nAllow: /\nSitemap: https://${shop.host}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n'
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=60' } })
}
