import { notFound } from 'next/navigation'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { addOnAllowed, type ModuleAccess } from '@/domains/modules/access'
import { MODULE_KEYS, MODULES, PLAN_GRANTABLE } from '@/domains/modules/registry'
import { merchantName } from '@/lib/admin/merchants'
import { merchantModules, TRIAL_DAYS } from '@/lib/admin/modules'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { MerchantTabs } from '../tabs'
import { endAddonAction, giveTrialAction } from './actions'
import { Submit } from '@/components/ui/submit'

export const metadata = { title: 'Modules' }

function grantedBy(a: ModuleAccess, planName: string | null) {
  if (a.how === 'trial') return `Trial until ${dayIN(a.trialEndsAt!)}`
  if (MODULES[a.key].status === 'next') return 'Coming next'
  switch (a.how) {
    case 'core': return 'Every plan'
    case 'plan': return `${planName ?? 'Their'} plan`
    case 'add_on': return 'Add-on'
    default: return 'Not granted'
  }
}

function usable(a: ModuleAccess) {
  if (a.why === 'usable') return <Badge tone="ok">Yes</Badge>
  if (a.why === 'paused') return <Badge tone="warn">Paused</Badge>
  if (a.why === 'needs') return <Badge tone="warn">Needs {MODULES[a.needs!].name}</Badge>
  if (a.why === 'next') return <span className="text-muted-foreground">—</span>
  return <span className="text-muted-foreground">No</span>
}

export default async function MerchantModulesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const name = await merchantName(staff, id)
  if (!name) notFound()
  const now = new Date()
  const [m, sp, admin] = await Promise.all([merchantModules(staff, id, now), searchParams, requireStaff(ADMIN_ONLY)])
  const canChange = admin.ok

  return (
    <>
      <PageHeader title={name} back={{ href: '/admin/merchants', label: 'Merchants' }} />
      <MerchantTabs id={id} on="modules" />
      <Notice ok={sp.ok} error={sp.error} />
      <DataTable label={`${name}'s modules`}>
        <DataTableHead><th>Module</th><th>Granted by</th><th>Merchant</th><th>Usable</th><th><span className="sr-only">Action</span></th></DataTableHead>
        <DataTableBody>
          {MODULE_KEYS.map((k) => {
            const a = m.access[k]
            const on = m.switchedOnAt[k]
            const addon = m.addonId[k]
            const trialable = canChange && PLAN_GRANTABLE.includes(k) && !a.granted && MODULES[k].status === 'now' && addOnAllowed(k, m.planCode)
            return (
              <DataTableRow key={k} dimmed={MODULES[k].status === 'next'}>
                <Td cell="a" className="font-medium">{MODULES[k].name}</Td>
                <Td cell="c">{grantedBy(a, m.planName)}</Td>
                <Td cell="e">{on ? `On since ${dayIN(on)}` : a.granted ? 'Off' : '—'}</Td>
                <Td cell="d">{usable(a)}</Td>
                <Td cell="f" className="text-right">
                  {trialable && (
                    <form action={giveTrialAction}>
                      <input type="hidden" name="tenantId" value={id} /><input type="hidden" name="module" value={k} />
                      <Submit variant="secondary">Give a {TRIAL_DAYS}-day trial of {MODULES[k].name}</Submit>
                    </form>
                  )}
                  {canChange && addon && (a.how === 'trial' || a.how === 'add_on') && (
                    <form action={endAddonAction}>
                      <input type="hidden" name="tenantId" value={id} /><input type="hidden" name="module" value={k} /><input type="hidden" name="addonId" value={addon} />
                      <Submit variant="secondary" className="after:hidden">End {a.how === 'trial' ? 'trial' : 'add-on'}</Submit>
                    </form>
                  )}
                </Td>
              </DataTableRow>
            )
          })}
        </DataTableBody>
      </DataTable>
      <p className="text-sm text-muted-foreground">A trial ends by itself after {TRIAL_DAYS} days. Paid add-ons come with billing.</p>
    </>
  )
}
