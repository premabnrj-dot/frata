import type { Metadata } from 'next'
import { HomeView } from '@/components/storefront/pages'
import { shopCatalogue } from '@/lib/queries/storefront'
import { robotsFor, shopFor, shopHref } from '../_shop'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const shop = await shopFor(params)
  const description = shop.tagline || `${shop.shopName}: shop online${shop.codOn ? ', pay on delivery' : ''}.`
  return { title: { absolute: shop.shopName }, description, alternates: { canonical: `https://${shop.host}/` }, robots: robotsFor(shop), openGraph: { title: shop.shopName, description, url: `https://${shop.host}/`, siteName: shop.shopName, type: 'website' } }
}

export default async function Home({ params }: { params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return <HomeView shop={shop} cat={await shopCatalogue(shop.id)} href={shopHref} now={new Date()} />
}
