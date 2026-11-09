import type { Metadata } from 'next'
import { Checkout } from '@/components/storefront/checkout'
import { checkoutReturnLine } from '@/components/storefront/checkout-lines'
import { shopModules } from '@/lib/queries/modules'
import { shopFor, shopHref } from '../../_shop'

export const revalidate = 60
export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } }

/** The one-page checkout: a static shell; the form prices the bag on the server. */
export default async function CheckoutPage({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  // The WhatsApp opt-in shows only when the shop can message (Communication usable): no consent for messages that
  // never come. The page is cached (60 s), so a newly connected number shows the box within a minute.
  const wa = await shopModules(shop.id, new Date().toISOString()).then((m) => m.access.communication.usable).catch(() => false)
  return <Checkout shopName={shop.shopName} legalName={shop.legalName} privacyHref={shopHref('/policies/privacy')} returnLine={checkoutReturnLine(shop.returnKind, shop.returnDays)} gst={shop.gst} waOptIn={wa} />
}
