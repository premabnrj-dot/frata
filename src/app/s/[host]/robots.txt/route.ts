import { shopFor } from '../_shop'

export const dynamic = 'force-static'
export const revalidate = 300
export const generateStaticParams = () => []

/** A shop that is opening soon asks not to be crawled; an open one points at its sitemap. */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const body = shop.publishedAt ? `User-agent: *\nAllow: /\nSitemap: https://${shop.host}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n'
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
