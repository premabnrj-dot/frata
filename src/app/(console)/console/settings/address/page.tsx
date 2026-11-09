import { Panel } from '@/components/ui/panel'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { isOwnDomainsConfigured } from '@/lib/env'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
import { addressFacts, liveNamesFor, shopDomainRows } from '@/lib/queries/addresses'
import { paymentStatusFor } from '@/lib/queries/payments'
import { takesLivePayments } from '@/lib/payments/keys'
import { oldNames, renamesLeft } from '@/domains/addresses/names'
import { canMakeMain, domainState } from '@/domains/addresses/domain-state'
import { AddressForm } from './address-form'
import { Domains } from './domains'

export const metadata = { title: 'Shop address' }

export default async function AddressPage() {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or an admin can change settings' : auth.message} />
  const t = auth.membership.tenantId
  const [f, rows, pay, liveNames] = await Promise.all([addressFacts(t).catch(() => null), shopDomainRows(t).catch(() => null), paymentStatusFor(t).catch(() => null), liveNamesFor(t).catch(() => [])])
  if (!f || !rows) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const support = !!auth.membership.supportSessionId
  // Own domains (D2·10): the rows with their derived state; live payments decide whether Make main needs Razorpay's word.
  // "Live payments" is the definer's own test (app_make_domain_main): live keys whose webhook has worked.
  const livePayments = takesLivePayments(pay)
  const views = rows.map((r) => ({ id: r.id, host: r.host, www: r.withWww ? `www.${r.host}` : null, state: domainState(r), razorpayOk: !!r.razorpayOkAt,
    canMain: canMakeMain(r, livePayments) }))
  return (
    <>
      {/* D1·9: a shop on live payments that has opened adds a name, then makes it main once Razorpay approves it. */}
      <AddressForm current={f.slug} shopDomain={SHOP_DOMAIN} left={renamesLeft(f.firstOpenedAt, f.renamesUsed)} old={oldNames(f.names)} frozen={f.frozen} support={support}
        twoStep={livePayments && !!f.firstOpenedAt} adding={liveNames.find((n) => n.added)?.name ?? null} />
      <div className="mt-4 max-w-xl">
        <Domains nameHost={shopHost(f.slug)} names={liveNames.map((n) => ({ ...n, host: shopHost(n.name) }))} rows={views} livePayments={livePayments} available={isOwnDomainsConfigured() && !f.frozen} canManage={!support}
          left={renamesLeft(f.firstOpenedAt, f.renamesUsed)} />
      </div>
    </>
  )
}
