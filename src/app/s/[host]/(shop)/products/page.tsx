import type { Metadata } from 'next'
import { AllView } from '@/components/storefront/pages'
import { shopCatalogue } from '@/lib/queries/storefront'
import { robotsFor, shopFor, shopHref } from '../../_shop'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const shop = await shopFor(params)
  return { title: { absolute: `Shop all | ${shop.shopName}` }, alternates: { canonical: `https://${shop.host}/products` }, robots: robotsFor(shop) }
}

export default async function All({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return <AllView cat={await shopCatalogue(shop.id)} href={shopHref} now={new Date()} lang={shop.shopLanguage} />
}
