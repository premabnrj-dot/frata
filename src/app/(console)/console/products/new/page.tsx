import { Panel } from '@/components/ui/panel'
import { sellsSized } from '@/domains/catalogue/sell-keys'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { shopSells } from '@/lib/queries/settings'
import { NewProductForm } from './new-product-form'

export const metadata = { title: 'Add product' }

export default async function NewProductPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  // A shop that sells nothing sized is never asked what kind (its products are one size).
  const sized = sellsSized(await shopSells(auth.membership.tenantId).catch(() => []))
  return <NewProductForm sized={sized} />
}
