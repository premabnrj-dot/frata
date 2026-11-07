import { ViewTabs } from '@/components/ui/view-tabs'

/** A merchant's pages in Admin, as tabs (mockup: Admin › Merchant › Modules). */
export function MerchantTabs({ id, on }: { id: string; on: 'overview' | 'modules' | 'plan' }) {
  const base = `/admin/merchants/${id}`
  return <ViewTabs label="Merchant" tabs={[
    { href: base, label: 'Overview', current: on === 'overview' },
    { href: `${base}/modules`, label: 'Modules', current: on === 'modules' },
    { href: `${base}/plan`, label: 'Plan', current: on === 'plan' },
  ]} />
}
