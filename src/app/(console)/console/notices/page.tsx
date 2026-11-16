import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { CONSOLE_ROLES } from '@/domains/tenancy/roles'
import { listNotices } from '@/lib/queries/notices'
import { TYPE_LABEL } from '@/domains/email/notices'
import { momentIN } from '@/lib/format-date'
import { MarkRead } from './mark-read'
import { BrandDecision } from './brand-decision'
import { decidesBrand } from '@/domains/brand/who'

export const metadata = { title: 'Notices' }

/** Console › Notices (mockup v2 screen 8): what Frrata told this shop, newest first; opening it marks them read. */
export default async function NoticesPage() {
  const auth = await requireMember(CONSOLE_ROLES)
  if (!auth.ok) return <Panel title={auth.message} />
  const list = await listNotices(auth.membership.tenantId, auth.userId, auth.membership.role, auth.membership.tenantName)
    .catch(() => null)
  if (!list) return <><PageHeader title="Notices" /><Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel></>
  const now = new Date()
  const unread = list.filter((n) => !n.read).map((n) => n.id)
  const decides = decidesBrand(auth.membership.role, auth.membership.supportSessionId)
  // A partner's brand change (one-address P1): where it stands, and the owner's two buttons while it waits.
  const STATE = { approved: ['ok', 'Approved'], declined: ['neutral', 'Declined'], replaced: ['neutral', 'Replaced'] } as const
  return (
    <>
      <PageHeader title="Notices" actions={<Link href="/console/settings/notifications" className="text-sm underline underline-offset-4">Your notifications</Link>} />
      {list.length === 0 ? <Panel title="No notices yet" /> : (
        <Section flush ariaLabel="Notices"><ul className="divide-y divide-border">
          {list.map((n) => (
            <li key={n.id} className="flex gap-3 px-4 py-3">
              <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${n.read ? 'border border-input' : 'bg-thread'}`} />
              <div className="min-w-0 flex-1">
                <p className={n.read ? '' : 'font-semibold'}>{n.title}{n.read ? null : <span className="sr-only"> (new)</span>}</p>
                {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {n.brand && n.brand.state !== 'open' ? <Badge tone={STATE[n.brand.state][0]}>{STATE[n.brand.state][1]}</Badge>
                    : <Badge tone={n.required ? 'warn' : 'neutral'}>{TYPE_LABEL[n.type]}</Badge>}{momentIN(n.at, now)}
                  {n.href && n.brand?.state !== 'declined' && n.brand?.state !== 'replaced' ? <Link href={n.href} className="inline-flex min-h-6 items-center underline underline-offset-4">Open</Link> : null}
                </p>
                {n.brand?.state === 'open' && decides ? <BrandDecision id={n.brand.id} /> : null}
              </div>
            </li>
          ))}
        </ul></Section>
      )}
      {auth.membership.supportSessionId ? null : <MarkRead ids={unread} />}
    </>
  )
}
