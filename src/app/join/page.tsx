import Link from 'next/link'
import { button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { Panel } from '@/components/ui/panel'
import { PictoTile } from '@/components/brand/illustrations'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { ActionForm } from '@/components/ui/action-form'
import { Submit } from '@/components/ui/submit'
import { PARTNER_ROLE_LABEL, type PartnerRole } from '@/domains/partners/team'
import { requireUser } from '@/lib/auth/require-user'
import { myPartnerInvites } from '@/lib/db/partners'
import { dayIN } from '@/lib/format-date'
import { acceptTeamInviteAction } from './actions'

export const metadata = { title: 'Join a partner’s team' }
export const dynamic = 'force-dynamic'

/** An invite to a partner's team (T1a; approved Studio mockup, Team). Nothing is joined until Accept. */
export default async function JoinPage() {
  const auth = await requireUser()
  const frame = (body: React.ReactNode) => <main data-shell className={`flex min-h-dvh items-start justify-center bg-background p-4 pt-16 ${SHELL_FONT_VARS}`}>{body}</main>
  if (!auth.ok) return frame(<Panel title="Sign in to see your invite" action={<Link href="/login" className={button()}>Sign in</Link>} />)
  const invites = await myPartnerInvites(auth.userId).catch(() => null)
  if (!invites) return frame(<Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>)
  if (!invites.length) return frame(<Panel title="No invite is waiting for you" action={<Link href="/partner" className={button({ variant: 'secondary' })}>Go to the partner workspace</Link>} />)
  return frame(
    <div className="w-full max-w-lg space-y-4">
      {invites.map((i) => (
        <section key={i.memberId} className="space-y-5 rounded-md border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <PictoTile name="clients" tone="indigo" />
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">Join {i.partnerName}</h1>
              {i.invitedBy && <p className="text-sm text-muted-foreground">Invited by {i.invitedBy}</p>}
            </div>
          </div>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">You</dt>
            <dd>{PARTNER_ROLE_LABEL[i.role as PartnerRole] ?? i.role}<InfoTip about="what a lead can do">You build the stores you’re given: products, orders, settings, the look. Handing a store to its owner and running the team stay with the partner’s owner.</InfoTip></dd>
            <dt className="text-muted-foreground">Stores</dt>
            <dd>{i.stores.length ? i.stores.join(', ') : 'None yet'}</dd>
            <dt className="text-muted-foreground">Until</dt>
            <dd className="font-mono text-xs leading-5">{dayIN(i.expiresAt)}</dd>
          </dl>
          <ActionForm action={acceptTeamInviteAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="memberId" value={i.memberId} />
            <Submit size="wrap">Join {i.partnerName}</Submit>
            <Link href="/partner" className="text-sm underline">Not now</Link>
          </ActionForm>
        </section>
      ))}
    </div>,
  )
}
