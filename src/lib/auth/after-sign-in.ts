import 'server-only'
import { partnerStatus, routeAfterSignIn, type SignInDestination } from '@/domains/access/route-after-sign-in'
import { accessFor, claimInvites } from '@/lib/db/platform'
import { myHandovers, myPartner } from '@/lib/db/partners'
import { errName } from '@/lib/log'

/**
 * After a person signs in — by the email link or by its 6-digit code: claim
 * their invites (confirmed email only, in SQL; a handover of a partner-built
 * store is NOT claimed, it waits for Accept), then say where they go. One
 * function, so both ways in behave the same.
 */
export async function destinationAfterSignIn(userId: string): Promise<SignInDestination> {
  try {
    await claimInvites(userId)
    const [access, partner, handovers] = await Promise.all([accessFor(userId), myPartner(userId), myHandovers(userId)])
    return routeAfterSignIn({ isStaff: access.staffRole !== null, storeCount: access.memberships.length, handovers: handovers.length, partner: partnerStatus(partner) })
  } catch (err) {
    console.error('[destinationAfterSignIn]', errName(err))
    return '/console'
  }
}
