import { ViewTabs } from '@/components/ui/view-tabs'

/** Console › Brand's two tabs (one-address P2 mockup screen 8): the record, and the checkout design. */
export function BrandTabs({ at }: { at: 'record' | 'checkout' }) {
  return <div className="mt-3"><ViewTabs label="Brand" tabs={[
    { href: '/console/brand', label: 'Logo, colours and type', current: at === 'record' },
    { href: '/console/brand/checkout', label: 'Checkout', current: at === 'checkout' },
  ]} /></div>
}
