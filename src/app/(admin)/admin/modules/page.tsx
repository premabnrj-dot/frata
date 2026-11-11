import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { openPauses } from '@/lib/admin/modules'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { sinceIN } from '@/lib/format-date'
import { pauseModuleAction, resumeModuleAction } from './actions'
import { Submit } from '@/components/ui/submit'

export const metadata = { title: 'Modules' }

const BILLING = { core: 'Every plan', plan: 'In plans', add_on: 'Add-on' } as const

export default async function ModulesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [pauses, sp, admin] = await Promise.all([openPauses(), searchParams, requireStaff(ADMIN_ONLY)])
  const now = new Date()
  const paused = new Map(pauses.map((p) => [p.module, p]))
  return (
    <>
      <PageHeader title="Modules" meta="Pausing holds a module back for every shop. Its messages wait; nothing is lost." />
      <Notice ok={sp.ok} error={sp.error} />
      <DataTable label="Modules">
        <DataTableHead><th>Module</th><th>Sold as</th><th>State</th><th><span className="sr-only">Action</span></th></DataTableHead>
        <DataTableBody>
          {MODULE_KEYS.map((k) => {
            const def = MODULES[k]
            const p = paused.get(k)
            return (
              <DataTableRow key={k} dimmed={def.status === 'next'}>
                <Td cell="a" className="font-medium">{def.name}</Td>
                <Td cell="c">{BILLING[def.billing]}</Td>
                <Td cell="d">{p ? <Badge tone="warn">Paused {sinceIN(p.pausedAt, now)}</Badge> : def.status === 'next' ? <Badge>Next</Badge> : <Badge tone="ok">Running</Badge>}{p && <span className="ml-2 text-muted-foreground">{p.reason}</span>}</Td>
                <Td cell="f" className="text-right">
                  {admin.ok && (p ? (
                    <form action={resumeModuleAction}>
                      <input type="hidden" name="module" value={k} />
                      <Submit>Resume {def.name}</Submit>
                    </form>
                  ) : (
                    <form action={pauseModuleAction} className="flex justify-end gap-2">
                      <input type="hidden" name="module" value={k} />
                      <label className="sr-only" htmlFor={`reason-${k}`}>Why pause {def.name}</label>
                      <input id={`reason-${k}`} name="reason" required minLength={3} maxLength={200} placeholder="Why" className="h-10 w-40 rounded-md border border-input bg-card px-3 text-sm md:h-9" />
                      <Submit variant="secondary">Pause {def.name} for everyone</Submit>
                    </form>
                  ))}
                </Td>
              </DataTableRow>
            )
          })}
        </DataTableBody>
      </DataTable>
    </>
  )
}
