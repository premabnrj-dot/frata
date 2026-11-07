import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { setupFor } from '@/lib/queries/settings'
import { Checklist } from '../_components/checklist'
import { OpenMoment } from '../_components/open-moment'

export const metadata = { title: 'Setup' }

/** The setup checklist on its own page (U·4): Home links here while a step is open; the shop is closed from here. */
export default async function SetupPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const setup = await setupFor(auth.membership.tenantId).catch((err) => { console.error('[setup]', err instanceof Error ? err.name : err); return null })
  if (!setup) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  return (
    <OpenMoment address={setup.address} header={<PageHeader title="Setup" back={{ href: '/console', label: 'Home' }} meta={<>{setup.name} · <span className="font-mono">{setup.address}</span></>} />}>
      <Checklist setup={setup} canManage={auth.membership.role !== 'staff'} />
    </OpenMoment>
  )
}
