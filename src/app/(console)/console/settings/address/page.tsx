import { Panel } from '@/components/ui/panel'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { shopWithSettings } from '@/lib/queries/settings'
import { AddressForm } from './address-form'

export default async function AddressPage() {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or an admin can change settings' : auth.message} />
  const shop = await shopWithSettings(auth.membership.tenantId).catch(() => null)
  if (!shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  return <AddressForm current={shop.slug} shopDomain={SHOP_DOMAIN} published={shop.settings.publishedAt !== null} support={!!auth.membership.supportSessionId} />
}
