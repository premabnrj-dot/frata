import type { Metadata } from 'next'
import { shareImage } from '@/lib/seo/share-image'
import { homeSeo } from '@/domains/seo/defaults'
import { HomeView } from '@/components/storefront/pages'
import { shopBestSellers, shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { bestSellersFor, themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../_shop'
import { shopTags, toMetadata } from '../_meta'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const shop = await shopFor(params)
  const { title, description } = homeSeo(shop)
  return toMetadata(shopTags(shop, { path: '/', title, shareTitle: shop.shopName, description, image: await shareImage(shop, { kind: 'shop', cat: await shopCatalogue(shop.id) }, shop.shopName, new Date()) }))
}

export default async function Home({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  const best = await bestSellersFor(theme, (d) => shopBestSellers(shop.id, d))
  return <HomeView shop={shop} cat={await shopCatalogue(shop.id)} href={shopHref} now={new Date()} theme={theme} bestSellers={best} />
}
