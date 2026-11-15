import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { todayItems } from '@/lib/admin/today'
import { sourceOf, sourcesFor, type TodayKind } from '@/domains/admin/today'

export const metadata = { title: 'Today' }
export const dynamic = 'force-dynamic'

const TONE = { warn: 'warn', bad: 'danger', info: 'info' } as const
const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })
const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/** When this month's invoices go out: the 1st of next month, IST. */
function nextRun(now: Date): string {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000)
  const first = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1, 6))
  return `${MONTH.format(now)}'s invoices go out on ${DAY.format(first)}.`
}

/** Admin › Today (Neel N4, board Main): what needs someone, oldest first, one action each. */
export default async function AdminToday() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { items, missed } = await todayItems(staff)
  return (
    <>
      <PageHeader title="Today" meta={items.length ? `${items.length} to do · oldest first` : undefined} />
      {items.length === 0 ? <Panel title="Nothing waits." /> : (
        <section aria-label="Needs you" className="max-w-[900px] overflow-hidden rounded-lg border border-border">
          {items.map((it, i) => {
            const src = sourceOf(it.kind)
            return (
              <div key={`${it.kind}:${it.key}`} className="grid grid-cols-[minmax(0,1fr)] items-start gap-2 border-line-soft px-5 py-3.5 not-first:border-t sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <span><Badge tone={TONE[src.tone]}>{src.chip}</Badge></span>
                <span className="flex min-w-0 flex-col">
                  <b className="font-medium">{it.title}</b>
                  <span className="text-sm text-muted-foreground">{it.line}</span>
                </span>
                <Link href={it.href} prefetch={false} className={button({ variant: i === 0 ? 'primary' : 'secondary' })}>{it.action}</Link>
              </div>
            )
          })}
        </section>
      )}
      {missed.length > 0 && <p role="status" className="mt-3 text-sm text-warn-text">Couldn&apos;t check: {missed.map((k: TodayKind) => sourceOf(k).chip).join(', ')}. Reload to try again.</p>}
      {sourcesFor(staff.role).some((x) => x.kind === 'issue_run') && <p className="mt-5 text-sm text-muted-foreground">{nextRun(new Date())}</p>}
    </>
  )
}
