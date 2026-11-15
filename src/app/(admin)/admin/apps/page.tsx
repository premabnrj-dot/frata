import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'
import { MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { appInterest, openPauses } from '@/lib/admin/modules'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN, dayMonthIN } from '@/lib/format-date'
import { DialogButton, MoreDialogs } from '../_components/form-dialog'
import { pauseModuleAction, resumeModuleAction } from './actions'

export const metadata = { title: 'Apps' }
export const dynamic = 'force-dynamic'

const SOLD = { core: 'every plan', plan: 'in plans', add_on: 'paid app' } as const

/** Admin › Apps (Neel N4, board Reference › Apps): each app's state; Pause for everyone in ⋯, Resume on the row. */
export default async function AppsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [{ view }, pauses, admin, interest] = await Promise.all([searchParams, openPauses(), requireStaff(ADMIN_ONLY),
    appInterest(staff).catch((err) => { console.error('[admin apps interest]', err instanceof Error ? err.name : 'error'); return null })])
  const waiting = view === 'waiting'
  const paused = new Map(pauses.map((p) => [p.module, p]))
  return (
    <>
      <PageHeader title="Apps" />
      <ViewTabs label="Apps" tabs={[
        { href: '/admin/apps', label: 'Apps', current: !waiting },
        { href: '/admin/apps?view=waiting', label: 'Waiting list', count: interest?.length, current: waiting },
      ]} />
      {waiting ? (
        interest === null ? <Panel title="The waiting list couldn't be read. Reload to try again." /> : interest.length === 0 ? <Panel title="No one is waiting." /> : (
          <ul className="mt-2 divide-y divide-line-soft text-sm">
            {interest.map((r) => (
              <li key={`${r.module}-${r.tenantId}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span><span className="font-medium">{MODULES[r.module].name}</span> · <Link href={`/admin/merchants/${r.tenantId}`} className="underline underline-offset-2">{r.shop}</Link></span>
                <span className="text-muted-foreground">{r.people} {r.people === 1 ? 'person' : 'people'} · since {dayIN(r.firstAt)}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="mt-2 divide-y divide-line-soft">
          {MODULE_KEYS.map((k) => {
            const def = MODULES[k]
            const p = paused.get(k)
            const id = <input type="hidden" name="module" value={k} />
            return (
              <li key={k} className={`flex flex-wrap items-center justify-between gap-2 py-3 ${def.status === 'next' ? 'opacity-60' : ''}`}>
                <span><span className="font-medium">{def.name}</span> <span className="text-sm text-muted-foreground">· {SOLD[def.billing]}</span></span>
                <span className="flex items-center gap-2">
                  {p ? <Badge tone="warn">Paused {dayMonthIN(p.pausedAt)}</Badge> : def.status === 'next' ? <Badge>Coming next</Badge> : <Badge tone="ok">Running</Badge>}
                  {admin.ok && def.status === 'now' && (p ? (
                    <DialogButton spec={{ label: 'Resume', title: `Resume ${def.name}?`, description: 'Held messages go out with the next send.', action: resumeModuleAction, fields: id, keep: 'Keep paused', go: `Resume ${def.name}` }} />
                  ) : (
                    <MoreDialogs label={`More for ${def.name}`} specs={[{ label: 'Pause for every store…', title: `Pause ${def.name} for every store?`, description: 'Its messages wait. Nothing is lost.', action: pauseModuleAction, danger: true, keep: 'Keep running', go: `Pause ${def.name}`,
                      fields: <>{id}<label className="flex flex-col gap-1 text-sm"><span className="font-medium">Why</span><input name="reason" required minLength={3} maxLength={200} data-error="Say why, in a few words." className={FIELD} /><FieldMessage name="reason" /></label></> }]} />
                  ))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
