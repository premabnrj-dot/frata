import { isListed } from '@/domains/storefront/listing'
import { shopCatalogue } from '@/lib/queries/storefront'
import { shopFor } from '../_shop'

export const dynamic = 'force-static'
export const revalidate = 300
export const generateStaticParams = () => []

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** Home, listed products and collections, policies — from the shop's own address. Empty while opening soon. */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const base = `https://${shop.host}`
  const now = new Date()
  const urls: { loc: string; lastmod?: string }[] = []
  if (shop.publishedAt) {
    const cat = await shopCatalogue(shop.id)
    urls.push({ loc: `${base}/` }, { loc: `${base}/products` })
    for (const p of cat.products) if (isListed(p, now)) urls.push({ loc: `${base}/products/${p.handle}`, lastmod: p.since.slice(0, 10) })
    for (const c of cat.collections) urls.push({ loc: `${base}/collections/${c.handle}` })
    for (const k of ['shipping', 'returns', 'privacy', 'terms', 'contact']) urls.push({ loc: `${base}/policies/${k}` })
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}
