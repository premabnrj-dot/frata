import { ImageResponse } from 'next/og'
import { PATH_SHAPE, storeHost } from '@/domains/media/sizes'
import { BLOB_STORE_ID } from '@/lib/env'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp } from '@/lib/http/client-ip'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { shopLook } from '@/lib/queries/storefront'
import { ICON_SIZES, iconContent, iconHash, type IconSize } from '@/lib/seo/icon'
import { photoUri } from '@/lib/seo/render-card'
import { themeOf } from '@/lib/themes/page-look'
import { shopForRoute } from '../../_shop'

// =============================================================================
// FILE: src/app/s/[host]/icon/[...icon]/route.tsx — A SHOP'S ICON (search and sharing S1·6), as the share-card route:
// canonical paths only (/icon/<32|180|192|512>/<hash16>.png, no query string), the host's shop, the logo only from our
// own store and this shop's brand folder (PATH_SHAPE), read capped and checked by sharp, drawing budgeted per caller
// then per shop. A day on the CDN when current; 5 minutes when stale. Opening-soon shops get one too (a tab needs it).
// =============================================================================

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = Promise<{ host: string; icon: string[] }>
const NO_STORE = { 'cache-control': 'no-store' }
const FILE = /^([0-9a-f]{16})\.png$/

export async function GET(req: Request, { params }: { params: Params }) {
  const parts = (await params).icon
  const size = Number(parts[0]) as IconSize
  const m = parts.length === 2 ? FILE.exec(parts[1]!) : null
  if (!m || !(ICON_SIZES as readonly number[]).includes(size) || String(size) !== parts[0]) return new Response('Not found', { status: 404, headers: NO_STORE })
  if (new URL(req.url).search) return new Response(null, { status: 308, headers: { location: `/icon/${size}/${m[1]}.png`, ...NO_STORE } })
  const shop = await shopForRoute(params)
  if (!shop) return new Response('Not found', { status: 404, headers: NO_STORE })
  const now = new Date() // clock-ok: a route handler, run per request on the server
  const c = iconContent(shop, themeOf(shop, await shopLook(shop.id)))
  const current = iconHash(c) === m[1]
  if (!(await withinLimit(LIMITS.ogRenderIp, await clientIp(), now, true) && await withinLimit(LIMITS.ogRender, shop.id, now, true))) {
    return new Response('Busy', { status: 503, headers: { ...NO_STORE, 'retry-after': '600' } })
  }
  // The logo: this shop's brand folder in our own store, the exact stored shape, ≤ 1 MB, checked by sharp.
  let logo: string | null = null, missing = false
  if (c.logo) {
    const host = storeHost(BLOB_STORE_ID)
    try {
      const u = new URL(c.logo); const p = PATH_SHAPE.exec(u.pathname.slice(1))
      if (host && u.protocol === 'https:' && u.host === host && !u.search && p && p[1] === shop.id && p[2] === 'brand') {
        const r = await fetchWithTimeout(c.logo, { redirect: 'error' }, 5000)
        const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null
        logo = buf && buf.length <= 1_000_000 ? await photoUri(buf, 0, 0, 'contain') : null
      }
    } catch { logo = null }
    missing = !logo
  }
  const pad = Math.round(size * 0.14), inner = size - 2 * pad
  const png = new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, color: c.fg, fontSize: Math.round(size * 0.58), fontWeight: 600, fontFamily: 'sans-serif' }}>
        {logo ? <img src={logo} width={inner} height={inner} style={{ objectFit: 'contain' }} /> : c.initial}
      </div>
    ),
    { width: size, height: size },
  )
  const body = new Uint8Array(await png.arrayBuffer())
  const cache = current && !missing ? 'public, max-age=86400, s-maxage=86400' : 'public, max-age=300, s-maxage=300'
  return new Response(body, { headers: { 'content-type': 'image/png', 'cache-control': cache, 'x-content-type-options': 'nosniff' } })
}
