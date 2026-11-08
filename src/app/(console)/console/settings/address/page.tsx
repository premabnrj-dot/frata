import { Panel } from '@/components/ui/panel'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { addressFacts } from '@/lib/queries/addresses'
import { oldNames, renamesLeft } from '@/domains/addresses/names'
import { AddressForm } from './address-form'

export const metadata = { title: 'Shop address' }

export default async function AddressPage() {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or an admin can change settings' : auth.message} />
  const f = await addressFacts(auth.membership.tenantId).catch(() => null)
  if (!f) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  return <AddressForm current={f.slug} shopDomain={SHOP_DOMAIN} left={renamesLeft(f.firstOpenedAt, f.renamesUsed)} old={oldNames(f.names)} frozen={f.frozen} support={!!auth.membership.supportSessionId} />
}
