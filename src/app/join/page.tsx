import { PartnerFrame, JoinSteps } from '@/components/passkeys/partner-frame'
import { ActionForm } from '@/components/ui/action-form'
import { Panel } from '@/components/ui/panel'
import { Submit } from '@/components/ui/submit'
import { PARTNER_ROLE_LABEL, type PartnerRole } from '@/domains/partners/team'
import { requireUser } from '@/lib/auth/require-user'
import { myPartnerInvites } from '@/lib/db/partners'
import { dayMonthIN } from '@/lib/format-date'
import { signOutAction } from '@/app/(admin)/admin/sign-out/actions'
import Link from 'next/link'
import { button } from '@/components/ui/button'
import { acceptTeamInviteAction } from './actions'

export const metadata = { title: 'Join a partner’s team' }
export const dynamic = 'force-dynamic'

/**
 * An invite to a partner's team (T1a; partner sign-in mockup screens 6 and 12): step 1 of Join · Approval · Passkey.
 * Nothing is joined until Accept; then the workspace asks the owner to approve this person's first passkey.
 */
export default async function JoinPage() {
  const auth = await requireUser()
  if (!auth.ok) return <PartnerFrame><h1 className="font-display text-title font-semibold">Sign in to see your invite</h1><Link href="/partner/sign-in" className={button({ size: 'lg' })}>Sign in</Link></PartnerFrame>
  const invites = await myPartnerInvites(auth.userId).catch(() => null)
  if (!invites) return <PartnerFrame><Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel></PartnerFrame>
  if (!invites.length) {
    // Screen 12: signed in with another address than the invite's (the invite is found by this person's email).
    return (
      <PartnerFrame>
        <h1 className="font-display text-title font-semibold">No invite for this email</h1>
        <p className="text-sm text-muted-foreground">You’re signed in as {auth.email}</p>
        <form action={signOutAction}><input type="hidden" name="to" value="partner" /><Submit size="lg" className="w-full">Switch account</Submit></form>
      </PartnerFrame>
    )
  }
  const i = invites[0]!
  return (
    <PartnerFrame>
      <JoinSteps at={1} />
      <h1 className="font-display text-title font-semibold">Join {i.partnerName}</h1>
      <p className="text-sm text-muted-foreground">
        {i.invitedBy ? <>{i.invitedBy} invited you as {PARTNER_ROLE_LABEL[i.role as PartnerRole] ?? i.role}</> : <>Invited as {PARTNER_ROLE_LABEL[i.role as PartnerRole] ?? i.role}</>}
        {i.stores.length > 0 && <><br />Clients: {i.stores.join(', ')}</>}
      </p>
      <ActionForm action={acceptTeamInviteAction} className="grid gap-4">
        <input type="hidden" name="memberId" value={i.memberId} />
        <div className="grid gap-1.5">
          <label htmlFor="join-email" className="text-sm font-medium">Work email</label>
          <input id="join-email" value={auth.email} readOnly aria-readonly className="h-11 w-full rounded-md border border-input bg-muted px-3 text-base text-muted-foreground" />
        </div>
        <Submit size="lg">Accept invite</Submit>
      </ActionForm>
      <p className="text-sm text-muted-foreground">Invite ends {dayMonthIN(i.expiresAt)}</p>
    </PartnerFrame>
  )
}
