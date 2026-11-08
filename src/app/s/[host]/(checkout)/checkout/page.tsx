import type { Metadata } from 'next'
import { Checkout } from '@/components/storefront/checkout'
import { shopFor, shopHref } from '../../_shop'

export const revalidate = 60
export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } }

const RETURNS: Record<string, (d: number) => string | null> = { exchange_or_refund: (d) => `${d}-day returns and exchanges`, exchange_only: (d) => `${d}-day exchanges`, refund_only: (d) => `${d}-day returns`, none: () => null }

/** The one-page checkout: a static shell; the form prices the bag on the server. */
export default async function CheckoutPage({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return <Checkout shopName={shop.shopName} legalName={shop.legalName} privacyHref={shopHref('/policies/privacy')} returnLine={RETURNS[shop.returnKind]?.(shop.returnDays) ?? null} />
}
