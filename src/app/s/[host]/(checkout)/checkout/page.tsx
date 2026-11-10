import type { Metadata } from 'next'
import { Checkout } from '@/components/storefront/checkout'
import { checkoutReturnLine } from '@/components/storefront/checkout-lines'
import { shopModules } from '@/lib/queries/modules'
import { Slot } from '@/components/modules/slots'
import { shopFor, shopHref } from '../../_shop'

export const revalidate = 60
export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } }

/** The one-page checkout: a static shell; the form prices the bag on the server. */
export default async function CheckoutPage({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  // The WhatsApp opt-in shows only when the shop can message (Communication usable): no consent for messages that
  // never come. The page is cached (60 s), so a newly connected number shows the box within a minute.
  const m = await shopModules(shop.id, new Date().toISOString()).catch(() => null)
  const wa = m?.access.communication.usable ?? false
  // A module above the form (EkCode's button; checkout.identity). Cached with the page; nothing per shopper here.
  const identity = m ? <Slot name="checkout.identity" ctx={{ tenantId: shop.id }} access={m.access} /> : null
  return <Checkout shopName={shop.shopName} legalName={shop.legalName} privacyHref={shopHref('/policies/privacy')} returnLine={checkoutReturnLine(shop.returnKind, shop.returnDays)} gst={shop.gst} waOptIn={wa} identity={identity} />
}
