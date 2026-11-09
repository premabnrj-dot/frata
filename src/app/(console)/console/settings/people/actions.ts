'use server'

import { errName } from '@/lib/log'
import { asModule } from '@/lib/auth/as-module'

import { revalidatePath } from 'next/cache'
import { asMember } from '@/lib/auth/as-member'
import { removePartner } from '@/lib/db/partners'
import { inviteAccountant, removeAccountant, revokeAccountantInvite } from '@/lib/db/accountants'
import { CAN_INVITE_ACCOUNTANT } from '@/domains/tenancy/roles'

// Settings › People. Only the shop's OWNER removes its partner (a members row with role owner: a Frrata support
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
    console.error('[removeShopPartner]', errName(err))
    return { ok: false, error: 'We could not remove the partner. Nothing was changed.' }
  }
}

// ── The accountant (GST plan phase 3): owners and admins invite and remove one; never a Frrata support visit. ──
const ACCOUNTANT: Record<string, string> = {
  not_manager: 'Only the shop’s owner or an admin can do that.', bad_email: 'Check the email address.',
  already_member: 'That person already works on this shop.', no_accountant: 'That person isn’t this shop’s accountant now.', wrong_shop: 'Reload the page and try again.',
}
const UUID = /^[0-9a-f-]{36}$/

export async function inviteShopAccountant(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = String(email ?? '').trim().toLowerCase()
  if (!e || e.length > 254) return { ok: false, error: ACCOUNTANT.bad_email! }
  try {
    // Inviting is part of the GST app (a module): asModule refuses in words when GST is off or not in the plan.
    const r = await asModule('gst', CAN_INVITE_ACCOUNTANT, { action: 'shop.accountant_invited' }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return { ok: false as const, error: 'not_manager' }
      return inviteAccountant(tx, auth.membership.tenantId, auth.userId, e)
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return { ok: false, error: ACCOUNTANT[r.value.error] ?? 'We could not send the invite. Nothing was changed.' }
    revalidatePath('/console/settings/people')
    return { ok: true }
  } catch (err) {
    console.error('[inviteShopAccountant]', errName(err))
    return { ok: false, error: 'We could not send the invite. Nothing was changed.' }
  }
}

export async function removeShopAccountant(member: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID.test(member)) return { ok: false, error: ACCOUNTANT.no_accountant! }
  try {
    const r = await asMember(CAN_INVITE_ACCOUNTANT, { action: 'shop.accountant_removed' }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return { ok: false as const, error: 'not_manager' }
      return removeAccountant(tx, auth.membership.tenantId, auth.userId, member)
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return { ok: false, error: ACCOUNTANT[r.value.error] ?? 'We could not remove them. Nothing was changed.' }
    revalidatePath('/console/settings/people')
    return { ok: true }
  } catch (err) {
    console.error('[removeShopAccountant]', errName(err))
    return { ok: false, error: 'We could not remove them. Nothing was changed.' }
  }
}

export async function revokeShopAccountantInvite(invite: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID.test(invite)) return { ok: false, error: 'Reload the page and try again.' }
  try {
    const r = await asMember(CAN_INVITE_ACCOUNTANT, { action: 'shop.accountant_invite_revoked' }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return { ok: false as const, error: 'not_manager' }
      return revokeAccountantInvite(tx, auth.membership.tenantId, auth.userId, invite)
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return { ok: false, error: ACCOUNTANT[r.value.error] ?? 'We could not cancel the invite.' }
    revalidatePath('/console/settings/people')
    return { ok: true }
  } catch (err) {
    console.error('[revokeShopAccountantInvite]', errName(err))
    return { ok: false, error: 'We could not cancel the invite.' }
  }
}
