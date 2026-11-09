import { Panel } from '@/components/ui/panel'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { isOwnDomainsConfigured } from '@/lib/env'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
import { addressFacts, shopDomainRows } from '@/lib/queries/addresses'
import { paymentStatusFor } from '@/lib/queries/payments'
import { oldNames, renamesLeft } from '@/domains/addresses/names'
import { domainState } from '@/domains/addresses/domain-state'
import { AddressForm } from './address-form'
import { Domains } from './domains'

export const metadata = { title: 'Shop address' }

export default async function AddressPage() {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or an admin can change settings' : auth.message} />
  const t = auth.membership.tenantId
  const [f, rows, pay] = await Promise.all([addressFacts(t).catch(() => null), shopDomainRows(t).catch(() => null), paymentStatusFor(t).catch(() => null)])
  if (!f || !rows) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const support = !!auth.membership.supportSessionId
  // Own domains (D2·10): the rows with their derived state; live payments decide whether Make main needs Razorpay's word.
  const views = rows.map((r) => ({ id: r.id, host: r.host, www: r.withWww ? `www.${r.host}` : null, state: domainState(r), razorpayOk: !!r.razorpayOkAt }))
  const livePayments = !!pay?.connected && pay.mode === 'live' && !!pay.webhookSeenAt
  return (
    <>
      <AddressForm current={f.slug} shopDomain={SHOP_DOMAIN} left={renamesLeft(f.firstOpenedAt, f.renamesUsed)} old={oldNames(f.names)} frozen={f.frozen} support={support} />
      <div className="mt-4 max-w-xl">
        <Domains nameHost={shopHost(f.slug)} slug={f.slug} rows={views} livePayments={livePayments} available={isOwnDomainsConfigured() && !f.frozen} canManage={!support} />
      </div>
    </>
  )
}
