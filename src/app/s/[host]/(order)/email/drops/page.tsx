import type { Metadata } from 'next'
import { DropsConsent } from '@/components/storefront/drops-consent'
import { shopFor } from '../../../_shop'

export const revalidate = 60
export const metadata: Metadata = { title: 'New drops by email', robots: { index: false, follow: false }, referrer: 'no-referrer' }

/** /email/drops?o=&t= — opened from an order email's footer; nothing is saved until the shopper taps. */
export default async function DropsPage({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return <DropsConsent shopName={shop.shopName} />
}
