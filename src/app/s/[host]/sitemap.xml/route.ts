import { pick, urlFor } from '@/domains/media/sizes'
import { inCollection, isListed } from '@/domains/storefront/listing'
import { shopCatalogue } from '@/lib/queries/storefront'
import { shopPages } from '@/lib/queries/pages'
import { shopForRoute } from '../_shop'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// Not force-static: a 404 for an unknown host must never be cached (tenancy audit 2026-11-07). The rows are
// cached by the loaders; the CDN keeps a real shop's answer five minutes.
export const dynamic = 'force-dynamic'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** Home, listed products and collections, policies, pages — from the shop's own address. Empty while opening soon. */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const shop = await shopForRoute(params)
  if (!shop) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  const base = `https://${shop.host}`
  const now = new Date()
  const urls: { loc: string; lastmod?: string; images?: string[] }[] = []
  if (shop.publishedAt) {
    const cat = await shopCatalogue(shop.id)
    urls.push({ loc: `${base}/` }, { loc: `${base}/products` })
    // Products with up to three photos each (S2·4: Google Images); collections with nothing listed are left out.
    for (const p of cat.products) if (isListed(p, now)) urls.push({ loc: `${base}/products/${p.handle}`, lastmod: p.since.slice(0, 10), images: p.images.slice(0, 3).map((i) => urlFor(i.base, pick(i.widths, 1200))) })
    for (const c of cat.collections) if (inCollection(c, cat.products, now).length) urls.push({ loc: `${base}/collections/${c.handle}` })
    for (const k of ['shipping', 'returns', 'privacy', 'terms', 'contact']) urls.push({ loc: `${base}/policies/${k}` })
    // TS1a: the shop's live pages (About, FAQ), from the cached list.
    for (const p of await shopPages(shop.id)) urls.push({ loc: `${base}/pages/${p.handle}` })
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${(u.images ?? []).map((i) => `<image:image><image:loc>${esc(i)}</image:loc></image:image>`).join('')}</url>`).join('\n')}\n</urlset>\n`
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=60' } })
}
