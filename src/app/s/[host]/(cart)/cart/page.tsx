import type { Metadata } from 'next'
import { CartLink } from '@/components/storefront/cart-link'
import { fill, wordsFor } from '@/components/storefront/words'
import { shopFor } from '../../_shop'

export const revalidate = 60
export const metadata: Metadata = { title: 'Your bag', robots: { index: false, follow: false } }

/**
 * The bag link (Storefront API SA1b, plan D·1; docs: Bag link): `/cart?l=<size id>:<qty>,…`. A static shell; the island
 * reads the link in the browser, fills the shopper's own bag and opens checkout. Nothing is written on a server.
 */
export default async function CartPage({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const w = wordsFor(shop.shopLanguage).bagLink
  return <CartLink site={shop.siteOrigin} words={{ opening: w.opening, broken: w.broken, again: w.again, goTo: fill(w.goTo, { name: shop.shopName }) }} />
}
