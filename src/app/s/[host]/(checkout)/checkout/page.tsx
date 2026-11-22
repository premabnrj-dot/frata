import type { Metadata } from 'next'
import { Checkout } from '@/components/storefront/checkout'
import { checkoutReturnLine } from '@/components/storefront/checkout-lines'
import { shopModules } from '@/lib/queries/modules'
import { Slot } from '@/components/modules/slots'
import { shopFor, shopHref } from '../../_shop'
import { brandLookFor, checkoutWords } from '../../_brand'
import { TrustBlocks } from '@/components/storefront/trust-blocks'

export const revalidate = 60
export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } }

/** The one-page checkout: a static shell; the form prices the bag on the server. */
/** A code-site store's heading and trust blocks (one-address P2·3), the blocks drawn here so checkout's script doesn't grow. */
function brandWords(shop: Parameters<typeof checkoutWords>[0], design: Parameters<typeof checkoutWords>[1]) {
  const w = checkoutWords(shop, design)
  return { heading: w.heading, trust: w.trust.length ? <TrustBlocks blocks={w.trust} /> : null }
}

export default async function CheckoutPage({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  // The WhatsApp opt-in shows only when the shop can message (Communication usable): no consent for messages that
  // never come. The page is cached (60 s), so a newly connected number shows the box within a minute.
  const now = new Date()
  const [m, b] = await Promise.all([shopModules(shop.id, now.toISOString()).catch(() => null), brandLookFor(shop, now)])
  const wa = m?.access.communication.usable ?? false
  // A module above the form (EkCode's button; checkout.identity). Cached with the page; nothing per shopper here.
  const identity = m ? <Slot name="checkout.identity" ctx={{ tenantId: shop.id }} access={m.access} /> : null
  // The marker tells the visit beacon a checkout began (src/beacon/fe.ts).
  return <><i hidden data-fe="begin_checkout" /><Checkout shopName={shop.shopName} legalName={shop.legalName} privacyHref={shopHref('/policies/privacy')} returnLine={checkoutReturnLine(shop.returnKind, shop.returnDays)} gst={shop.gst} waOptIn={wa} identity={identity} brand={b ? brandWords(shop, b.design) : undefined} /></>
}
