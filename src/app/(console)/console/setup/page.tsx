import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { setupFor } from '@/lib/queries/settings'
import { SetupCard } from '../_components/setup/setup-card'
import { OpenShop } from '../_components/open-shop'
import { OpenMoment } from '../_components/open-moment'
import { shopLink, whatsappShare } from '@/domains/analytics/link'

export const metadata = { title: 'Setup' }

/** The setup card on its own page (U·4, O2a·7): Home links here while a step is open; the store is closed from here. */
export default async function SetupPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const setup = await setupFor(auth.membership.tenantId).catch((err) => { console.error('[setup]', err instanceof Error ? err.name : 'error'); return null })
  if (!setup) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  return (
    <OpenMoment key={auth.membership.tenantId} name={setup.name} address={setup.address}
      whatsapp={whatsappShare(setup.name, shopLink(`https://${setup.address}`, '/', { preset: 'share_whatsapp' }))} header={<PageHeader title="Setup" back={{ href: '/console', label: 'Home' }} meta={<>{setup.name} · <span className="font-mono">{setup.address}</span></>} />}>
      <div className="grid gap-4">
        <SetupCard setup={setup} role={auth.membership.role} tenantId={auth.membership.tenantId} />
        {/* Closing stays here (ux rule 30): the store is opened from the card, closed for now from this page. */}
        <OpenShop open={setup.open} canManage={(CAN_MANAGE as readonly string[]).includes(auth.membership.role)} />
      </div>
    </OpenMoment>
  )
}
