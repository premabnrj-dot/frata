import { NextResponse } from 'next/server'
import { requireMember } from '@/lib/auth/require-member'
import { CONSOLE_ROLES } from '@/domains/tenancy/roles'

/**
 * GET /api/console/tenant — which shop a console request is for right now: the caller's own access
 * (requireMember), so it only ever tells someone their own shop id. The shell's TenantCheck reads it after each
 * move, for staff only, because a support visit can end or start in another tab while this tab's kept layout
 * still shows the old shop (tenancy audit of U·2a, MEDIUM 1). A GET, not a server action: actions run one at a
 * time and a navigation discards a pending one, which forced extra refreshes (impact review U·2a). Never cached.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMember(CONSOLE_ROLES)
  return NextResponse.json({ tenantId: auth.ok ? auth.membership.tenantId : null }, { headers: { 'cache-control': 'no-store' } })
}
