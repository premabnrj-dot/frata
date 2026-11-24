'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { asMember } from '@/lib/auth/as-member'
import { asModule } from '@/lib/auth/as-module'
import { cancelPartnerRequest, cancelPersonInvite, invitePerson, removePerson, sendPartnerRequest, type PeopleError } from '@/lib/db/people'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { errName } from '@/lib/log'
import type { Tx } from '@/lib/db'
import { GIVEN_ROLES } from '@/domains/tenancy/people'

// Settings › People (docs/specs/2026-11-23-add-partner.md; owner 2026-11-23 "redrawn approved"). The owner and a Manager
// add Staff and Accountants; only the owner adds a Manager or the partner. A Frrata support visit does none of it (the
// action refuses it and the definers refuse it again). The tenant is requireMember's, the uid getUser()'s; who may give
// which role is re-checked in SQL (app_people_may_give).

const SENTENCES: Partial<Record<PeopleError, string>> = {
  not_manager: 'Only the store’s owner or a Manager can do that.',
  not_allowed: 'Only the store’s owner can do that.',
  not_owner: 'Only the store’s owner can add a partner.',
  bad_email: 'Enter an email like riya@kesarstudio.in.',
  own_email: 'This is your own email. Enter theirs.',
  already_member: 'This person already works on this store.',
  partner_person: 'This person works for your partner. They join through the partner.',
  invited: 'The owner already invited this person.',
  at_limit: 'Your plan has no room for more people. Change plan to add more.',
  no_invite: 'This invitation has ended. Reload the page.',
  no_person: 'This person isn’t on the store now. Reload the page.',
  has_partner: 'This store already has a partner. Remove them first.',
  has_request: 'Cancel the open partner invitation first.',
  no_request: 'This invitation has ended. Reload the page.',
  too_many: 'You sent 5 partner invitations today. Try again tomorrow.',
}
const FAILED = 'We couldn’t send the invitation. Nothing was changed.'
type Result = { ok: true; email?: string } | { ok: false; error: string; field?: 'email' }
const say = (e: PeopleError, fallback = FAILED): Result =>
  ({ ok: false, error: SENTENCES[e] ?? fallback, ...(e === 'bad_email' || e === 'own_email' || e === 'already_member' || e === 'partner_person' || e === 'invited' ? { field: 'email' as const } : {}) })

const Invite = z.object({ email: z.email().max(254), role: z.enum([...GIVEN_ROLES, 'partner']) })
const Id = z.uuid()

async function underLimits(uid: string, tenantId: string): Promise<boolean> {
  const now = new Date()
  const r = await Promise.all([withinLimit(LIMITS.peopleInvitePerson, uid, now, true), withinLimit(LIMITS.peopleInviteStore, tenantId, now, true),
    withinLimit(LIMITS.peopleInviteDay, uid, now, true)])
  return r.every(Boolean)
}

export async function addPersonAction(input: { email: string; role: string }): Promise<Result> {
  const p = Invite.safeParse({ email: String(input?.email ?? '').trim().toLowerCase(), role: input?.role })
  if (!p.success) return p.error.issues.some((i) => i.path[0] === 'email') ? say('bad_email') : { ok: false, error: FAILED }
  const { email, role } = p.data
  try {
    const run = async (tx: Tx, auth: { userId: string; membership: { tenantId: string; supportSessionId: string | null } }) => {
      if (auth.membership.supportSessionId) return { ok: false as const, error: 'not_manager' as const }
      if (!(await underLimits(auth.userId, auth.membership.tenantId))) return { ok: false as const, error: 'limit' as const }
      return role === 'partner' ? sendPartnerRequest(tx, auth.userId, email) : invitePerson(tx, auth.userId, email, role)
    }
    const action = role === 'partner' ? 'shop.partner_invited' : 'shop.person_invited'
    // The Accountant's login is part of the GST app, as before: asModule refuses in words when GST is off.
    const r = role === 'accountant'
      ? await asModule('gst', ['owner', 'admin'], { action }, run)
      : await asMember(role === 'staff' ? ['owner', 'admin'] : ['owner'], { action }, run)
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return r.value.error === 'limit' ? { ok: false, error: 'Too many invitations this hour. Try again in 1 hour.' } : say(r.value.error)
    revalidatePath('/console/settings/people')
    return { ok: true, email }
  } catch (err) {
    console.error('[addPersonAction]', errName(err))
    return { ok: false, error: FAILED }
  }
}

export async function cancelInviteAction(id: string): Promise<Result> {
  if (!Id.safeParse(id).success) return say('no_invite')
  return write(['owner', 'admin'], 'shop.invite_cancelled', (tx, uid) => cancelPersonInvite(tx, uid, id), 'We couldn’t cancel it. Nothing was changed.')
}

export async function removePersonAction(member: string): Promise<Result> {
  if (!Id.safeParse(member).success) return say('no_person')
  return write(['owner', 'admin'], 'shop.person_removed', (tx, uid) => removePerson(tx, uid, member), 'We couldn’t remove them. Nothing was changed.')
}

export async function cancelPartnerRequestAction(): Promise<Result> {
  return write(['owner'], 'shop.partner_invite_cancelled', (tx, uid) => cancelPartnerRequest(tx, uid), 'We couldn’t cancel it. Nothing was changed.')
}

async function write(roles: ('owner' | 'admin')[], action: string, fn: (tx: Tx, uid: string) => Promise<{ ok: true } | { ok: false; error: PeopleError }>, fallback: string): Promise<Result> {
  try {
    const r = await asMember(roles, { action }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return { ok: false as const, error: 'not_manager' as const }
      return fn(tx, auth.userId)
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return say(r.value.error, fallback)
    revalidatePath('/console/settings/people')
    return { ok: true }
  } catch (err) {
    console.error(`[${action}]`, errName(err))
    return { ok: false, error: fallback }
  }
}
