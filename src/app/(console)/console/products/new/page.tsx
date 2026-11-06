import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { NewProductForm } from './new-product-form'

export const metadata = { title: 'Add product · Frata' }

export default async function NewProductPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  return <NewProductForm />
}
