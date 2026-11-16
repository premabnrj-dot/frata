import { ViewTabs } from '@/components/ui/view-tabs'

/** A merchant's pages in Admin, as tabs (mockup: Admin › Merchant: Overview · Plan · Apps · Addresses). */
export function MerchantTabs({ id, on }: { id: string; on: 'overview' | 'apps' | 'plan' | 'addresses' | 'activity' }) {
  const base = `/admin/merchants/${id}`
  return <ViewTabs label="Merchant" tabs={[
    { href: base, label: 'Overview', current: on === 'overview' },
    { href: `${base}/plan`, label: 'Plan', current: on === 'plan' },
    { href: `${base}/apps`, label: 'Apps', current: on === 'apps' },
    { href: `${base}/addresses`, label: 'Addresses', current: on === 'addresses' },
    { href: `/admin/activity?shop=${id}`, label: 'Activity', current: on === 'activity' },
  ]} />
}
