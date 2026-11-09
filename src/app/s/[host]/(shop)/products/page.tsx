import type { Metadata } from 'next'
import { AllView } from '@/components/storefront/pages'
import { shopCatalogue } from '@/lib/queries/storefront'
import { shopFor, shopHref } from '../../_shop'
import { shopTags, toMetadata } from '../../_meta'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const shop = await shopFor(params)
  return toMetadata(shopTags(shop, { kind: 'list', path: '/products', title: `Shop all | ${shop.shopName}`, shareTitle: 'Shop all', description: null, image: null }))
}

export default async function All({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return <AllView cat={await shopCatalogue(shop.id)} href={shopHref} now={new Date()} lang={shop.shopLanguage} />
}
