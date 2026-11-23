import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerCan } from '@/domains/partners/team'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { NewStoreForm } from './new-store-form'

export const metadata = { title: 'New client store' }

export default async function NewClientStorePage() {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  // A Builder makes no store (T1c; app_partner_create_shop_v2 refuses it too).
  if (!partnerCan(auth.partner.memberRole, 'createShop')) return <Panel title="Only your partner’s owner and Leads make client stores" />
  return (
    <>
      <Link href="/partner" className="text-sm text-muted-foreground hover:text-foreground">← Clients</Link>
      <PageHeader title="New client store" />
      <Section className="max-w-md" ariaLabel="New client store"><NewStoreForm shopDomain={SHOP_DOMAIN} /></Section>
    </>
  )
}
