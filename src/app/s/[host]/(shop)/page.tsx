import type { Metadata } from 'next'
import { HomeView } from '@/components/storefront/pages'
import { shopBestSellers, shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { bestSellersFor, themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../_shop'
import { shopTags, toMetadata } from '../_meta'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const shop = await shopFor(params)
  const description = shop.tagline || `${shop.shopName}: shop online${shop.codOn ? ', pay on delivery' : ''}.`
  return toMetadata(shopTags(shop, { kind: 'home', path: '/', title: shop.shopName, shareTitle: shop.shopName, description, image: null }))
}

export default async function Home({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  const best = await bestSellersFor(theme, (d) => shopBestSellers(shop.id, d))
  return <HomeView shop={shop} cat={await shopCatalogue(shop.id)} href={shopHref} now={new Date()} theme={theme} bestSellers={best} />
}
