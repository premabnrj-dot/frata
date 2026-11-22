import type { Metadata } from 'next'
import { OrderView } from '@/components/storefront/order-view'
import { orderPrefix } from '@/domains/signup/slug'
import { shopFor, shopHref } from '../../_shop'
import { brandLookFor } from '../../_brand'

export const revalidate = 60
export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false }, referrer: 'no-referrer' }

/** /orders#t=<token>: one static page for every order; the token never leaves the browser except in a POST body. */
export default async function OrdersPage({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  // A code-site store's thank-you line (one-address P2·3; empty draws nothing).
  const b = await brandLookFor(shop, new Date())
  return <OrderView prefix={orderPrefix(shop.orderPrefix, shop.shopName)} returnsHref={shopHref('/policies/returns')} thanks={b?.design.thanks || undefined} />
}
