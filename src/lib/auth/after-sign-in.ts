import 'server-only'
import { routeAfterSignIn, type SignInDestination } from '@/domains/access/route-after-sign-in'
import { accessFor, claimInvites } from '@/lib/db/platform'

/**
 * After a person signs in — by the email link or by its 6-digit code: claim
 * their invites (confirmed email only, in SQL), then say where they go. One
 * function, so both ways in behave the same.
 */
export async function destinationAfterSignIn(userId: string): Promise<SignInDestination> {
  try {
    await claimInvites(userId)
    const access = await accessFor(userId)
    return routeAfterSignIn({ isStaff: access.staffRole !== null, storeCount: access.memberships.length })
  } catch (err) {
    console.error('[destinationAfterSignIn]', err)
    return '/console'
  }
}
