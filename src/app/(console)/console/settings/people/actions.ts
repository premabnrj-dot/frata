'use server'

import { revalidatePath } from 'next/cache'
import { asMember } from '@/lib/auth/as-member'
import { removePartner } from '@/lib/db/partners'

// Settings › People. Only the shop's OWNER removes its partner (a members row with role owner: a Frata support
// visit has none, and the definer function refuses it too). The tenant is requireMember's, the uid getUser()'s.

const SENTENCES: Record<string, string> = {
  not_owner: 'Only the shop’s owner can remove its partner.',
  no_partner: 'This shop has no partner now.',
}

export async function removeShopPartner(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await asMember(['owner'], { action: 'shop.partner_removed' }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return { ok: false as const, error: 'not_owner' }
      return removePartner(tx, auth.membership.tenantId, auth.userId)
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return { ok: false, error: SENTENCES[r.value.error] ?? 'We could not remove the partner. Nothing was changed.' }
    revalidatePath('/console/settings/people')
    return { ok: true }
  } catch (err) {
    console.error('[removeShopPartner]', err instanceof Error ? err.name : err)
    return { ok: false, error: 'We could not remove the partner. Nothing was changed.' }
  }
}
