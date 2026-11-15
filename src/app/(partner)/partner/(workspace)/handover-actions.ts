'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePartner } from '@/lib/auth/require-partner'
import { sendSignInLink } from '@/lib/auth/send-link'
import { sendHandover } from '@/lib/db/partners'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { partnerCan } from '@/domains/partners/team'
import { CONFIRM_AGAIN, CONFIRM_FIRST } from '@/domains/partners/passkeys'

// Hand over from Clients (T1b; partner sign-in mockup screen 17; approved mockup screen 7 before it). Who may: the
// partner's owner (PARTNER_CAN.handOver), and the definer re-checks the link, the owner and a passkey check in the last
// 5 minutes (app_handover_invite, drizzle/0129); the store id comes from the form but only the partner's own store is
// accepted. The browser confirms the passkey first; the owner-to-be gets the usual sign-in email and accepts at /handover.

const SENTENCES: Record<string, string> = {
  not_partner: 'Only the partner owner can hand this store over.',
  has_owner: 'This store already has its owner.',
  bad_email: 'Enter an email like riya@kesarstudio.in.',
  member_email: 'This email is already on the store. Use the owner’s email.',
  confirm_again: CONFIRM_AGAIN,
  confirm_first: CONFIRM_FIRST,
}
const Input = z.object({ tenantId: z.uuid(), email: z.email().max(200) })

export async function handOverAction(input: { tenantId: string; email: string }): Promise<{ ok: true; email: string; emailed: boolean } | { ok: false; error: string; field?: 'email' }> {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false, error: auth.message }
  if (!partnerCan(auth.partner.memberRole, 'handOver')) return { ok: false, error: SENTENCES.not_partner! }
  const p = Input.safeParse({ tenantId: input?.tenantId, email: String(input?.email ?? '').trim().toLowerCase() })
  if (!p.success) return p.error.issues.some((i) => i.path[0] === 'email') ? { ok: false, error: SENTENCES.bad_email!, field: 'email' } : { ok: false, error: 'We could not send the invite. Nothing was changed.' }
  // Each hand over emails an address: the team-invite hourly limit, per partner person, failing closed (security L2).
  if (!(await withinLimit(LIMITS.partnerInvite, auth.partner.memberId, new Date(), true))) return { ok: false, error: 'Too many invites this hour. Try again later.' }
  const r = await sendHandover(auth, p.data.tenantId, p.data.email)
  if (!r.ok) return { ok: false, error: SENTENCES[r.error] ?? 'We could not send the invite. Nothing was changed.', ...(r.error === 'member_email' || r.error === 'bad_email' ? { field: 'email' as const } : {}) }
  // The invite stands without the email: the owner sees the store whenever they sign in with this address.
  const mail = await sendSignInLink(p.data.email).catch(() => ({ sent: false as const }))
  revalidatePath('/partner')
  return { ok: true, email: p.data.email, emailed: mail.sent }
}
