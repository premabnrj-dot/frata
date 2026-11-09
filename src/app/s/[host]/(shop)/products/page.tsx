import type { Metadata } from 'next'
import { pageDescription } from '@/domains/seo/defaults'
import { wordsFor } from '@/components/storefront/words'
import { shareImage } from '@/lib/seo/share-image'
import { AllView } from '@/components/storefront/pages'
import { shopCatalogue } from '@/lib/queries/storefront'
import { shopFor, shopHref } from '../../_shop'
import { shopTags, toMetadata } from '../../_meta'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const shop = await shopFor(params)
  return toMetadata(shopTags(shop, { path: '/products', title: `${wordsFor(shop.shopLanguage).shopAll} | ${shop.shopName}`, shareTitle: wordsFor(shop.shopLanguage).shopAll, description: pageDescription.list(shop.shopName, shop.codOn), image: await shareImage(shop, { kind: 'shop', cat: await shopCatalogue(shop.id) }, shop.shopName, new Date()) }))
}

export default async function All({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return <AllView cat={await shopCatalogue(shop.id)} href={shopHref} now={new Date()} lang={shop.shopLanguage} />
}
