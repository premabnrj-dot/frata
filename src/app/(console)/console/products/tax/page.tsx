import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { NowProvider } from '@/components/time/now'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { productsTax } from '@/lib/queries/catalogue'
import { HsnTable } from './hsn-table'

export const metadata = { title: 'HSN codes · Products' }

/** Products › HSN codes (plan 2026-11-09-gst-core-and-categories, mockup "Set HSN in bulk"): every product's code and rate. */
export default async function ProductsTaxPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const data = await productsTax(auth.membership.tenantId).catch((err) => { console.error('[products/tax]', err instanceof Error ? err.name : 'error'); return null })
  if (!data || !data.shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const now = new Date()
  return (
    <NowProvider at={now.toISOString()}>
      <PageHeader title="HSN codes" back={{ href: '/console/products', label: 'Products' }} />
      <HsnTable rows={data.rows} charges={chargesGst({ gstin: data.shop.gstin, scheme: data.shop.gstScheme as Scheme })} inclusive={data.shop.pricesIncludeGst} />
    </NowProvider>
  )
}
