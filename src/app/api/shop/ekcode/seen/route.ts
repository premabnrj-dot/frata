import { NextResponse } from 'next/server'
import { z } from 'zod'
import { shopRequest } from '@/lib/http/shop-api'
import { LIMITS } from '@/lib/db/rate-limit'
import { recordExposure } from '@/lib/db/ekcode'
import { tokenDigest } from '@/lib/ekcode/keys'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// The holdout's denominator (spec § Goal): one beacon per visitor a day says which arm saw this shop's checkout. Only
// the id's hash is kept, rolled up nightly and deleted (0088 app_ekcode_exposure, app_ekcode_daily).
export const dynamic = 'force-dynamic'
const Body = z.object({ arm: z.enum(['shown', 'held']), visitor: z.string().regex(/^[A-Za-z0-9_-]{22}$/) })

export async function POST(request: Request) {
  const g = await shopRequest(request, Body, LIMITS.ekShopMeIp)
  if (!g.ok) return g.response
  await recordExposure(g.tenantId, g.body.arm, tokenDigest(`${g.tenantId}|${g.body.visitor}`)).catch(() => {})
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'private, no-store' } })
}
