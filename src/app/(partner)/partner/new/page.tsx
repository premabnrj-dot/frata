import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { requirePartner } from '@/lib/auth/require-partner'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { NewStoreForm } from './new-store-form'

export const metadata = { title: 'New client store' }

export default async function NewClientStorePage() {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  return (
    <>
      <Link href="/partner" className="text-sm text-muted-foreground hover:text-foreground">← Clients</Link>
      <PageHeader title="New client store" />
      <Section className="max-w-md" ariaLabel="New client store"><NewStoreForm shopDomain={SHOP_DOMAIN} /></Section>
    </>
  )
}
