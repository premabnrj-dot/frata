import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { shareImage } from '@/lib/seo/share-image'
import { CollectionView } from '@/components/storefront/pages'
import { shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../../../_shop'
import { shopTags, toMetadata } from '../../../_meta'

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
  const { shop, cat, c } = await load(params)
  return toMetadata(shopTags(shop, { path: `/collections/${c.handle}`, title: `${c.title} | ${shop.shopName}`, shareTitle: c.title, description: c.description || null, image: await shareImage(shop, { kind: 'collection', collection: c, cat }, `${c.title} — ${shop.shopName}`, new Date()) }))
}

export default async function Collection({ params }: { params: Params }) {
  const { shop, cat, c } = await load(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  return <CollectionView c={c} cat={cat} href={shopHref} now={new Date()} top={theme.settings.collectionTop} lang={shop.shopLanguage} />
}
