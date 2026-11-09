import { NextResponse } from 'next/server'
import { requireShop } from '@/lib/auth/require-shop'
import { tenantForHost } from '@/lib/db/platform'
import { clientIp } from '@/lib/http/client-ip'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { beginAtShop } from '@/lib/ekcode/handshake'
import { ekcodeOnAt } from '@/lib/modules/ekcode/gate'

// "Continue with EkCode" (a plain link: no script on checkout). The flow is made here, from this request's own Host
// (tenancy B1), never from a URL; a moved address or a shop without EkCode goes back to its checkout.
export const dynamic = 'force-dynamic'
const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' }

export async function GET(request: Request) {
  const shop = await requireShop(request)
  if (!shop.ok) return new NextResponse(null, { status: shop.status, headers })
  const back = NextResponse.redirect(new URL('/checkout', request.url), { status: 303, headers })
  const t = await tenantForHost(shop.host)
  if (!t || t.movedTo || !(await ekcodeOnAt(shop.tenantId))) return back
  if (!(await withinLimit(LIMITS.ekStartIp, await clientIp(), new Date(), true))) return back
  const to = await beginAtShop(shop.tenantId, shop.host)
  return to ? NextResponse.redirect(to, { status: 303, headers }) : back
}
