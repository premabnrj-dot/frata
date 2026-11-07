'use server'

import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'

/**

 * (Outside src/app/(console): it writes nothing, so it is not an audited asMember action; check:actions sees requireMember.)
 * Which shop a console request is for right now (the caller's own access: requireMember). The shell's
 * TenantCheck asks after each move, for staff only, because a support visit can end or start in another tab
 * while this tab's kept layout still shows the old shop (tenancy audit of U·2a, MEDIUM 1). Returns null when the
 * caller has no console access (the next page shows the refusal).
 */
export async function currentTenantAction(): Promise<string | null> {
  const auth = await requireMember(ANY_MEMBER)
  return auth.ok ? auth.membership.tenantId : null
}
