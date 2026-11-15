import { NextResponse } from 'next/server'
import { currentStore } from '@/lib/auth/require-member'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

/**
 * GET /api/console/tenant — which shop a console request is for right now: the caller's own access
 * (currentStore: a member's store or a store they build, T1c), so it only ever tells someone their own shop id. The shell's TenantCheck reads it after each
 * move, for staff only, because a support visit can end or start in another tab while this tab's kept layout
 * still shows the old shop (tenancy audit of U·2a, MEDIUM 1). A GET, not a server action: actions run one at a
 * time and a navigation discards a pending one, which forced extra refreshes (impact review U·2a). Never cached.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const c = await currentStore()
  const tenantId = c.kind === 'member' ? c.result.membership.tenantId : c.kind === 'builder' ? c.build.tenantId : null
  return NextResponse.json({ tenantId }, { headers: { 'cache-control': 'no-store' } })
}
