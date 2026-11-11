import { PATH_SHAPE, storeHost } from '@/domains/media/sizes'
import { isListed } from '@/domains/storefront/listing'
import { BLOB_STORE_ID } from '@/lib/env'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp } from '@/lib/http/client-ip'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { shopCatalogue } from '@/lib/queries/storefront'
import { cardHash, cardOf, parseCardPath, type CardSource } from '@/lib/seo/card'
import { photoUri, renderCard } from '@/lib/seo/render-card'
import { shopTheme } from '@/lib/themes/page-look'
import { shopForRoute } from '../../_shop'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// =============================================================================
// FILE: src/app/s/[host]/og/[...card]/route.ts — A SHARE CARD (search and sharing S1·3; reviews 2026-11-09).
// Only canonical paths are drawn: /og/product/<uuid>/<hash16>.jpg, /og/collection/<uuid>/<hash16>.jpg,
// /og/shop/<hash16>.jpg; a query string or any other shape never reaches the renderer. The tenant is the host's; an
// id is found in that shop's cached catalogue (listed products only), so a random id costs no query. An unpublished
// shop: 404. The CDN keeps the current card a day (a deleted photo is gone from it within a day; any edit makes a
// new address anyway); a stale address shows the current card briefly. Drawing is budgeted per caller, then per shop
// (both fail closed). Photos come from our own store and this shop's folder only, ≤ 1 MB, checked by sharp.
// =============================================================================

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = Promise<{ host: string; card: string[] }>
const NO_STORE = { 'cache-control': 'no-store' }
const NOT_FOUND = () => new Response('Not found', { status: 404, headers: NO_STORE })
const DAY = 'public, max-age=86400, s-maxage=86400'
const SHORT = 'public, max-age=300, s-maxage=300'
const MAX_PHOTO = 1_000_000

/** At most 1 MB of a photo, read as it streams (no length header is trusted). */
async function readCapped(res: Response): Promise<Buffer | null> {
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []; let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return Buffer.concat(chunks)
    n += value.length
    if (n > MAX_PHOTO) { await reader.cancel(); return null }
    chunks.push(value)
  }
}

export async function GET(req: Request, { params }: { params: Params }) {
  const url = new URL(req.url)
  const p = parseCardPath((await params).card)
  if (!p) return NOT_FOUND()
  const shop = await shopForRoute(params)
  if (!shop?.publishedAt) return NOT_FOUND()
  const path = p.kind === 'shop' ? `/og/shop/${p.hash}.jpg` : `/og/${p.kind}/${p.id}/${p.hash}.jpg`
  // A query string never reaches the renderer: each would be a new cache entry (security review).
  if (url.search) return new Response(null, { status: 308, headers: { location: path, ...NO_STORE } })
  const now = new Date()

  const cat = await shopCatalogue(shop.id)
  let src: CardSource | null = null
  if (p.kind === 'shop') src = { kind: 'shop', cat }
  else if (p.kind === 'product') { const product = cat.products.find((x) => x.id === p.id && isListed(x, now)); if (product) src = { kind: 'product', product } }
  else { const collection = cat.collections.find((c) => c.id === p.id); if (collection) src = { kind: 'collection', collection, cat } }
  if (!src) return NOT_FOUND()

  const content = cardOf(shop, src, (await shopTheme(shop)), now)
  const hash = cardHash(content)
  const currentPath = p.kind === 'shop' ? `/og/shop/${hash}.jpg` : `/og/${p.kind}/${p.id}/${hash}.jpg`

  // Drawing is budgeted per caller, then per shop (fail closed). A stale address over budget is sent to the current one.
  const allowed = await withinLimit(LIMITS.ogRenderIp, await clientIp(), now, true) && await withinLimit(LIMITS.ogRender, shop.id, now, true)
  if (!allowed) {
    return hash !== p.hash ? new Response(null, { status: 302, headers: { location: currentPath, ...NO_STORE } })
      : new Response('Busy', { status: 503, headers: { ...NO_STORE, 'retry-after': '600' } })
  }

  // Photos: our own store, this shop's products folder, the exact stored shape; read capped; checked by sharp.
  const host = storeHost(BLOB_STORE_ID)
  const boxes = content.kind === 'product' ? [[1200, 630]] : content.kind === 'collection' ? [[790, 630], [404, 206], [404, 206], [404, 206]] : [[200, 268], [200, 268], [200, 268]]
  let missing = 0
  const photos = (await Promise.all(content.photos.slice(0, boxes.length).map(async (u, i) => {
    let ok = false
    try { const x = new URL(u); const m = PATH_SHAPE.exec(x.pathname.slice(1)); ok = !!host && x.protocol === 'https:' && x.host === host && !x.search && !!m && m[1] === shop.id && m[2] === 'products' } catch { ok = false }
    if (!ok) { missing++; return null }
    try {
      const r = await fetchWithTimeout(u, { redirect: 'error' }, 5000)
      const buf = r.ok ? await readCapped(r) : null
      const uri = buf ? await photoUri(buf, boxes[i]![0]!, boxes[i]![1]!) : null
      if (!uri) missing++
      return uri
    } catch { missing++; return null }
  }))).filter((x): x is string => !!x)

  const jpg = await renderCard(content, photos)
  if (!jpg) return new Response('Could not draw', { status: 500, headers: NO_STORE })
  // Kept a day when whole and current; briefly when a photo could not be read or the address is stale.
  const cache = hash === p.hash && missing === 0 ? DAY : SHORT
  return new Response(new Uint8Array(jpg), { headers: { 'content-type': 'image/jpeg', 'cache-control': cache, 'x-content-type-options': 'nosniff' } })
}
