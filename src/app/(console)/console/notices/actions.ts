'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { asMember } from '@/lib/auth/as-member'
import { CONSOLE_ROLES } from '@/domains/tenancy/roles'
import { markNoticesRead, setNoticePref } from '@/lib/queries/notices'
import { OPTIONAL_TYPES } from '@/domains/email/notices'
import { errName } from '@/lib/log'

// Notices (email plan E·1, task 9). The member is the session's, the shop requireMember's; a support visit reads but
// writes nothing (no read marks, no preferences: the reads belong to the shop's own people).

const Ids = z.array(z.uuid()).max(100)

export async function markNoticesReadAction(ids: string[]): Promise<void> {
  const parsed = Ids.safeParse(ids)
  if (!parsed.success) return
  try {
    const r = await asMember(CONSOLE_ROLES, { action: 'notices.read' }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return false
      await markNoticesRead(tx, auth.membership.tenantId, auth.userId, parsed.data)
      return true
    })
    if (r.ok && r.value) revalidatePath('/console', 'layout')
  } catch (err) { console.error('[notices] read', errName(err)) }
}

const Pref = z.object({ type: z.enum(OPTIONAL_TYPES), email: z.boolean() })

export async function setNoticePrefAction(input: { type: string; email: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  // Required types (billing, security, Frrata acted) are not in OPTIONAL_TYPES: refused here, not only in the UI.
  const p = Pref.safeParse(input)
  if (!p.success) return { ok: false, error: 'That can’t be switched off.' }
  try {
    const r = await asMember(CONSOLE_ROLES, { action: 'notices.pref', detail: p.data }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return 'A support visit can’t change someone’s notifications.'
      await setNoticePref(tx, auth.membership.tenantId, auth.userId, p.data.type, p.data.email)
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) return { ok: false, error: r.value }
    revalidatePath('/console/settings/notifications')
    return { ok: true }
  } catch (err) {
    console.error('[notices] pref', errName(err))
    return { ok: false, error: 'We could not save that. Nothing was changed.' }
  }
}
