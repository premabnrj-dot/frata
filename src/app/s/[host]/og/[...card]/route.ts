import { put } from '@vercel/blob'
import { storeHost } from '@/domains/media/sizes'
import { visibility, type Status } from '@/domains/catalogue/availability'
import { BLOB_READ_WRITE_TOKEN, BLOB_STORE_ID, isBlobConfigured } from '@/lib/env'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { errName } from '@/lib/log'
import { shopCatalogue, shopLook, shopProductById } from '@/lib/queries/storefront'
import { cardHash, cardOf, type CardContent, type CardSource } from '@/lib/seo/card'
import { photoUri, renderCard } from '@/lib/seo/render-card'
import { themeOf } from '@/lib/themes/page-look'
import { shopForRoute } from '../../_shop'

// =============================================================================
// FILE: src/app/s/[host]/og/[...card]/route.ts — A SHARE CARD (search and sharing S1·3; reviews 2026-11-09).
// Only canonical paths are drawn: /og/product/<uuid>/<hash16>.jpg, /og/collection/<uuid>/<hash16>.jpg,
// /og/shop/<hash16>.jpg — anything else (a query string, capitals, another shape) is never rendered. The tenant is the
// host's; an id is looked up inside it. Drafts, scheduled and archived products, and an unpublished shop: 404.
// A stale hash answers with the current card for 5 minutes (crawlers are not shown to follow a 308 on og:image).
// Made once: the drawn JPEG is stored in Blob under the shop's own folder and served from there after; drawing is
// budgeted per shop (fails closed). Photos are fetched here from our own store only and checked by sharp.
// =============================================================================

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = Promise<{ host: string; card: string[] }>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FILE = /^([0-9a-f]{16})\.jpg$/
const NOT_FOUND = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable'
const SHORT = 'public, max-age=300, s-maxage=300'

function parse(parts: string[]): { kind: CardContent['kind']; id: string | null; hash: string } | null {
  if (parts[0] === 'shop' && parts.length === 2) { const m = FILE.exec(parts[1]!); return m ? { kind: 'shop', id: null, hash: m[1]! } : null }
  if ((parts[0] === 'product' || parts[0] === 'collection') && parts.length === 3 && UUID.test(parts[1]!)) {
    const m = FILE.exec(parts[2]!); return m ? { kind: parts[0], id: parts[1]!, hash: m[1]! } : null
  }
  return null
}

const jpeg = (body: Buffer | ArrayBuffer, cache: string) => new Response(new Uint8Array(body as ArrayBuffer), { headers: { 'content-type': 'image/jpeg', 'cache-control': cache, 'x-content-type-options': 'nosniff' } })

export async function GET(req: Request, { params }: { params: Params }) {
  const url = new URL(req.url)
  const p = parse((await params).card)
  if (!p) return NOT_FOUND()
  // A query string never reaches the renderer: it would make every request a new cache entry (security review).
  if (url.search) return new Response(null, { status: 308, headers: { location: url.pathname, 'cache-control': 'no-store' } })
  const shop = await shopForRoute(params)
  if (!shop?.publishedAt) return NOT_FOUND()
  const now = new Date()

  let src: CardSource | null = null
  if (p.kind === 'product') {
    const product = await shopProductById(shop.id, p.id!)
    const v = product ? visibility(product.status as Status, product.publishAt ? new Date(product.publishAt) : null, now) : null
    if (product && v?.reachable) src = { kind: 'product', product }
  } else {
    const cat = await shopCatalogue(shop.id)
    if (p.kind === 'shop') src = { kind: 'shop', cat }
    else { const collection = cat.collections.find((c) => c.id === p.id); if (collection) src = { kind: 'collection', collection, cat } }
  }
  if (!src) return NOT_FOUND()

  const content = cardOf(shop, src, themeOf(shop, await shopLook(shop.id)), now)
  const hash = cardHash(content)
  const current = hash === p.hash
  const cache = current ? IMMUTABLE : SHORT
  const host = storeHost(BLOB_STORE_ID)
  const stored = host ? `https://${host}/tenants/${shop.id}/og/${p.kind}/${p.id ?? 'shop'}/${hash}.jpg` : null

  // Made once: a card already drawn is served from the store.
  if (stored) {
    try {
      const r = await fetchWithTimeout(stored, { redirect: 'error' }, 4000)
      if (r.ok && r.headers.get('content-type') === 'image/jpeg') return jpeg(await r.arrayBuffer(), cache)
    } catch { /* not stored yet, or the store is down: draw it */ }
  }
  if (!(await withinLimit(LIMITS.ogRender, shop.id, now, true))) return new Response('Busy', { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '600' } })

  // Photos from our own store and this shop's folder only, each ≤ 1 MB, checked by sharp before drawing.
  const own = host ? `https://${host}/tenants/${shop.id}/` : null
  const boxes = content.kind === 'product' ? [[1200, 630]] : content.kind === 'collection' ? [[790, 630], [404, 206], [404, 206], [404, 206]] : [[200, 268], [200, 268], [200, 268]]
  const photos = (await Promise.all(content.photos.slice(0, boxes.length).map(async (u, i) => {
    if (!own || !u.startsWith(own)) return null
    try {
      const r = await fetchWithTimeout(u, { redirect: 'error' }, 5000)
      const len = Number(r.headers.get('content-length') ?? 0)
      if (!r.ok || len > 1_000_000) return null
      const buf = Buffer.from(await r.arrayBuffer())
      return buf.length > 1_000_000 ? null : photoUri(buf, boxes[i]![0]!, boxes[i]![1]!)
    } catch { return null }
  }))).filter((x): x is string => !!x)

  const jpg = await renderCard(content, photos)
  if (!jpg) return new Response('Could not draw', { status: 500, headers: { 'cache-control': 'no-store' } })
  if (stored && isBlobConfigured()) {
    await put(`tenants/${shop.id}/og/${p.kind}/${p.id ?? 'shop'}/${hash}.jpg`, jpg, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true, token: BLOB_READ_WRITE_TOKEN })
      .catch((err: unknown) => console.error('[og] store', errName(err)))
  }
  return jpeg(jpg, cache)
}

