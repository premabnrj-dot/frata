import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { CONSOLE_ROLES } from '@/domains/tenancy/roles'
import { listNotices } from '@/lib/queries/notices'
import { TYPE_LABEL } from '@/domains/email/notices'
import { dateTimeIN } from '@/lib/format-date'
import { MarkRead } from './mark-read'

export const metadata = { title: 'Notices' }

/** Console › Notices (mockup v2 screen 8): what Frrata told this shop, newest first; opening it marks them read. */
export default async function NoticesPage() {
  const auth = await requireMember(CONSOLE_ROLES)
  if (!auth.ok) return <Panel title={auth.message} />
  const list = await listNotices(auth.membership.tenantId, auth.userId, auth.membership.tenantName)
    .catch(() => null)
  if (!list) return <><PageHeader title="Notices" /><Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel></>
  const unread = list.filter((n) => !n.read).map((n) => n.id)
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
                  <Badge tone={n.required ? 'warn' : 'neutral'}>{TYPE_LABEL[n.type]}</Badge>{dateTimeIN(n.at)}
                  {n.href ? <Link href={n.href} className="underline underline-offset-4">Open</Link> : null}
                </p>
              </div>
            </li>
          ))}
        </ul></Section>
      )}
      {auth.membership.supportSessionId ? null : <MarkRead ids={unread} />}
    </>
  )
}
