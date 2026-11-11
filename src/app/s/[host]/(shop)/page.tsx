import type { Metadata } from 'next'
import { shareImage } from '@/lib/seo/share-image'
import { homeSeo } from '@/domains/seo/defaults'
import { HomeView } from '@/components/storefront/pages'
import { LoopPlayer } from '@/components/storefront/sections/loop-player'
import { shopBestSellers, shopCatalogue, shopVideos } from '@/lib/queries/storefront'
import { bestSellersFor, shopTheme, videosFor } from '@/lib/themes/page-look'
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
  // The catalogue needs no theme: it loads beside the look, then the best sellers and videos the look names (speed
  // review: one wait less on a cold render).
  const [theme, cat] = await Promise.all([shopTheme(shop), shopCatalogue(shop.id)])
  const [best, videos] = await Promise.all([bestSellersFor(theme, (d) => shopBestSellers(shop.id, d)), videosFor(theme, (k) => shopVideos(shop.id, k))])
  return <><HomeView shop={shop} cat={cat} href={shopHref} now={new Date()} theme={theme} bestSellers={best} videos={videos} />{Object.keys(videos).length > 0 && <LoopPlayer />}</>
}
