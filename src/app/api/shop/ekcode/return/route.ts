import { NextResponse } from 'next/server'
import { requireShop } from '@/lib/auth/require-shop'
import { finishAtShop, setSession } from '@/lib/ekcode/handshake'
import { signInFromEkcode } from '@/lib/queries/customers'

// Back from ekcode.in with a one-time code: state checked against this shop's own cookie, the grant redeemed for THIS
// shop and host with the PKCE challenge, in one transaction; the shop's own session opens. No cache tag changes.
export const dynamic = 'force-dynamic'
const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' }

export async function GET(request: Request) {
  const shop = await requireShop(request)
  if (!shop.ok) return new NextResponse(null, { status: shop.status, headers })
  const q = new URL(request.url).searchParams
  const code = q.get('code') ?? '', state = q.get('state') ?? ''
  const back = (hash: string) => NextResponse.redirect(new URL(`/checkout${hash}`, request.url), { status: 303, headers })
  if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !/^[A-Za-z0-9_-]{43}$/.test(state)) return back('')
  const challenge = await finishAtShop(state)
  if (!challenge) return back('')
  const r = await signInFromEkcode(shop.tenantId, shop.host, code, challenge).catch(() => null)
  if (!r) return back('')
  await setSession(r.token)
  return back('#ek')
}
