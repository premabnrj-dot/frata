import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { SUPPORT_REASON_LABEL, type SupportReason } from '@/domains/support/session'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN } from '@/lib/format-date'
import { storeActivity } from '@/lib/queries/activity'

export const metadata = { title: 'Activity' }

/** What Frata support did in this store, and when (owner call 1: every visit is shown). */
export default async function ActivityPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const { visits, events } = await storeActivity(auth.membership.tenantId)
  return (
    <>
      <PageHeader title="Activity" />
      <section className="space-y-3 rounded-md border border-border bg-card p-5">
        <h2 className="text-[15px] font-semibold">Visits from Frata support</h2>
        {visits.length === 0 ? <p className="text-sm text-muted-foreground">Frata support has not been in your console.</p> : (
          <ul className="divide-y divide-border text-sm">
            {visits.map((v) => {
              const changes = events.filter((e) => e.supportSessionId === v.id && e.actorKind === 'support').length
              return (
                <li key={v.id} className="py-2.5">
                  <span className="font-medium">{v.staffEmail}</span> from Frata support, {dateTimeIN(v.startedAt)}
                  {v.endedAt ? ` to ${dateTimeIN(v.endedAt)}` : ` until ${dateTimeIN(v.expiresAt)}`}, for {SUPPORT_REASON_LABEL[v.reason as SupportReason].toLowerCase()}
                  {v.note ? `: ${v.note}` : ''}. <span className="text-muted-foreground">{changes === 0 ? 'No changes.' : `${changes} change${changes === 1 ? '' : 's'}.`}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
