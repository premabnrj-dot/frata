import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionView } from '@/components/storefront/pages'
import { shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import { robotsFor, shopFor, shopHref } from '../../../_shop'

export const revalidate = 60
export const generateStaticParams = () => []

type Params = Promise<{ host: string; handle: string }>

async function load(params: Params) {
  const shop = await shopFor(params)
  const { handle } = await params
  if (!/^[a-z0-9-]{1,80}$/.test(handle)) notFound()
  const cat = await shopCatalogue(shop.id)
  const c = cat.collections.find((x) => x.handle === handle)
  if (!c) notFound()
  return { shop, cat, c }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { shop, c } = await load(params)
  const url = `https://${shop.host}/collections/${c.handle}`
  return { title: { absolute: `${c.title} | ${shop.shopName}` }, description: c.description || undefined, alternates: { canonical: url }, robots: robotsFor(shop), openGraph: { title: c.title, url, siteName: shop.shopName } }
}

export default async function Collection({ params }: { params: Params }) {
  const { shop, cat, c } = await load(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  return <CollectionView c={c} cat={cat} href={shopHref} now={new Date()} top={theme.settings.collectionTop} />
}
