import type { Metadata } from 'next'
import { Checkout } from '@/components/storefront/checkout'
import { checkoutReturnLine } from '@/components/storefront/checkout-lines'
import { shopFor, shopHref } from '../../_shop'

export const revalidate = 60
export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } }

/** The one-page checkout: a static shell; the form prices the bag on the server. */
export default async function CheckoutPage({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return <Checkout shopName={shop.shopName} legalName={shop.legalName} privacyHref={shopHref('/policies/privacy')} returnLine={checkoutReturnLine(shop.returnKind, shop.returnDays)} />
}
