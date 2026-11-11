import { NextResponse } from 'next/server'
import { requireShop } from '@/lib/auth/require-shop'
import { clientIp } from '@/lib/http/client-ip'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clearSession, sessionToken } from '@/lib/ekcode/handshake'
import { forgetSession, prefillFor } from '@/lib/queries/customers'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// GET: what checkout fills in for this shop's signed-in shopper (no-store; 0 statements without a session).
// POST: "Not you?" — the session ends and its prefill is gone.
export const dynamic = 'force-dynamic'
const headers = { 'cache-control': 'private, no-store' }

export async function GET(request: Request) {
  const shop = await requireShop(request)
  if (!shop.ok) return NextResponse.json({ error: shop.error }, { status: shop.status, headers })
  const token = await sessionToken()
  if (!token) return NextResponse.json({ signedIn: false }, { headers })
  if (!(await withinLimit(LIMITS.ekShopMeIp, await clientIp(), new Date(), true))) return NextResponse.json({ signedIn: false }, { status: 429, headers })
  const p = await prefillFor(shop.tenantId, token)
  return NextResponse.json(p ? { signedIn: true, ...p } : { signedIn: false }, { headers })
}

export async function POST(request: Request) {
  const shop = await requireShop(request)
  if (!shop.ok) return NextResponse.json({ error: shop.error }, { status: shop.status, headers })
  const token = await sessionToken()
  if (token) await forgetSession(shop.tenantId, token)
  await clearSession()
  return NextResponse.json({ signedIn: false }, { headers })
}
