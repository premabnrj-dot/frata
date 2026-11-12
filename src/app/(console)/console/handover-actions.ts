'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { asMember } from '@/lib/auth/as-member'
import { sendSignInLink } from '@/lib/auth/send-link'
import { sendHandover } from '@/lib/db/partners'

// Hand over (approved mockup screen 7): the store's own partner invites its owner. The definer function
// (drizzle/0023) locks the store and re-checks the partner, the link and that there is no owner yet; then the
// owner gets the usual sign-in email, and signing in shows them the store to accept (/handover).

const SENTENCES: Record<string, string> = {
  not_partner: 'Only the partner’s owner can hand this store over.',
  has_owner: 'This store already has its owner.',
  bad_email: 'That does not look like an email address.',
  member_email: 'Use the brand owner’s email, not one already on this store.',
}

/** `field`: the mistake is the email typed (shown under the field); otherwise the hand-over itself was refused. */
export async function handOverAction(input: { email: string }): Promise<{ ok: true; email: string; emailed: boolean } | { ok: false; error: string; field?: 'email' }> {
  const email = z.email().max(200).safeParse(String(input?.email ?? '').trim().toLowerCase())
  if (!email.success) return { ok: false, error: SENTENCES.bad_email!, field: 'email' }
  try {
    const r = await asMember(['partner'], { action: 'shop.handover_invited' }, async (tx, auth) => sendHandover(tx, auth.membership.tenantId, auth.userId, email.data))
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return { ok: false, error: SENTENCES[r.value.error] ?? 'We could not send the invite. Nothing was changed.', ...(r.value.error === 'member_email' ? { field: 'email' as const } : {}) }
    // The invite stands without the email: the owner sees the store whenever they sign in with this address.
    const mail = await sendSignInLink(email.data).catch(() => ({ sent: false as const }))
    revalidatePath('/console', 'layout')
    return { ok: true, email: email.data, emailed: mail.sent }
  } catch (err) {
    console.error('[handOverAction]', err instanceof Error ? err.name : err)
    return { ok: false, error: 'We could not send the invite. Nothing was changed.' }
  }
}
