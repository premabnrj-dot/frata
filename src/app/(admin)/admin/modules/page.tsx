import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { appInterest, openPauses } from '@/lib/admin/modules'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN, sinceIN } from '@/lib/format-date'
import { pauseModuleAction, resumeModuleAction } from './actions'
import { Submit } from '@/components/ui/submit'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'

export const metadata = { title: 'Modules' }

const BILLING = { core: 'Every plan', plan: 'In plans', add_on: 'Add-on' } as const

export default async function ModulesPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [pauses, admin, interest] = await Promise.all([openPauses(), requireStaff(ADMIN_ONLY), appInterest(staff).catch((err) => { console.error('[admin modules interest]', err instanceof Error ? err.name : 'error'); return null })])
  const now = new Date()
  const paused = new Map(pauses.map((p) => [p.module, p]))
  const asked = (k: string) => { const rows = (interest ?? []).filter((r) => r.module === k); return rows.length ? `${rows.length} ${rows.length === 1 ? 'shop' : 'shops'} asked` : '' }
  return (
    <>
      <PageHeader title="Modules" meta="Pausing holds a module back for every shop. Its messages wait; nothing is lost." />
      <DataTable label="Modules">
        <DataTableHead><th>Module</th><th>Sold as</th><th>State</th><th><span className="sr-only">Action</span></th></DataTableHead>
        <DataTableBody>
          {MODULE_KEYS.map((k) => {
            const def = MODULES[k]
            const p = paused.get(k)
            return (
              <DataTableRow key={k} dimmed={def.status === 'next'}>
                <Td cell="a" className="font-medium">{def.name}</Td>
                <Td cell="c">{BILLING[def.billing]}{def.status === 'next' && interest ? <span className="ml-2 text-muted-foreground">{asked(k)}</span> : null}</Td>
                <Td cell="d">{p ? <Badge tone="warn">Paused {sinceIN(p.pausedAt, now)}</Badge> : def.status === 'next' ? <Badge>Coming next</Badge> : <Badge tone="ok">Running</Badge>}{p && <span className="ml-2 text-muted-foreground">{p.reason}</span>}</Td>
                <Td cell="f" className="text-right">
                  {admin.ok && (p ? (
                    <ActionForm action={resumeModuleAction}>
                      <input type="hidden" name="module" value={k} />
                      <Submit>Resume {def.name}</Submit>
                    </ActionForm>
                  ) : (
                    <ActionForm action={pauseModuleAction} className="flex flex-wrap justify-end gap-2">
                      <input type="hidden" name="module" value={k} />
                      <label className="sr-only" htmlFor={`reason-${k}`}>Why pause {def.name}</label>
                      <input id={`reason-${k}`} name="reason" required minLength={3} maxLength={200} placeholder="Why" data-error="Say why, in a few words." className="h-10 w-40 rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-mark md:h-9" />
                      <Submit variant="secondary">Pause {def.name} for everyone</Submit>
                      <span className="basis-full text-left empty:hidden"><FieldMessage name="reason" /></span>
                    </ActionForm>
                  ))}
                </Td>
              </DataTableRow>
            )
          })}
        </DataTableBody>
      </DataTable>
      {interest && interest.length ? (
        <Section title="Asked to be told" className="mt-6">
          <ul className="divide-y divide-border text-sm">
            {interest.map((r) => (
              <li key={`${r.module}-${r.tenantId}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium">{MODULES[r.module].name}</span> · <Link href={`/admin/merchants/${r.tenantId}`} className="underline underline-offset-2">{r.shop}</Link></span>
                <span className="text-muted-foreground">{r.people} {r.people === 1 ? 'person' : 'people'} · since {dayIN(r.firstAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  )
}
