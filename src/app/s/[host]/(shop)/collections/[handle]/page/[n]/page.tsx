import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionView } from '@/components/storefront/pages'
import { inCollection, pageOf, pageParam } from '@/domains/storefront/listing'
import { shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../../../../../_shop'
import { shopTags, toMetadata } from '../../../../../_meta'

// Page 2 onward of a collection (speed review P2): its own address, so each page is cached on its own.
export const revalidate = 60
export const generateStaticParams = () => []

type Params = Promise<{ host: string; handle: string; n: string }>

async function load(params: Params) {
  const shop = await shopFor(params)
  const { handle, n } = await params
  const page = pageParam(n)
  if (!page || !/^[a-z0-9-]{1,80}$/.test(handle)) notFound()
  const cat = await shopCatalogue(shop.id)
  const c = cat.collections.find((x) => x.handle === handle)
  const now = new Date()
  if (!c || page > pageOf(inCollection(c, cat.products, now), page).pages) notFound()
  return { shop, cat, c, page, now }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { shop, c, page } = await load(params)
  return toMetadata(shopTags(shop, { path: `/collections/${c.handle}/page/${page}`, title: `${c.title} · page ${page} | ${shop.shopName}`, shareTitle: `${c.title} · page ${page}`, description: null, image: null }))
}

export default async function CollectionPage({ params }: { params: Params }) {
  const { shop, cat, c, page, now } = await load(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  return <CollectionView c={c} cat={cat} href={shopHref} now={now} top={theme.settings.collectionTop} lang={shop.shopLanguage} page={page} />
}
