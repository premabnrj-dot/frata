import type { Metadata } from 'next'
import { collectionSeo } from '@/domains/seo/defaults'
import { notFound, permanentRedirect } from 'next/navigation'
import { shareImage } from '@/lib/seo/share-image'
import { CollectionView } from '@/components/storefront/pages'
import { JsonLd } from '@/components/storefront/json-ld'
import { breadcrumbJsonLd, itemListJsonLd } from '@/domains/seo/defaults'
import { inCollection } from '@/domains/storefront/listing'
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
  const to = !c && cat.movedCollections?.[handle]
  if (to) permanentRedirect(`/collections/${to}`)
  if (!c) notFound()
  return { shop, cat, c }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { shop, cat, c } = await load(params)
  const seo = collectionSeo(c, shop.shopName)
  return toMetadata(shopTags(shop, { path: `/collections/${c.handle}`, title: seo.title, shareTitle: c.title, description: seo.description, image: await shareImage(shop, { kind: 'collection', collection: c, cat }, `${c.title} — ${shop.shopName}`, new Date()) }))
}

export default async function Collection({ params }: { params: Params }) {
  const { shop, cat, c } = await load(params)
  const theme = themeOf(shop, await shopLook(shop.id))
  const now = new Date()
  const base = `https://${shop.host}`
  return (
    <>
      <CollectionView c={c} cat={cat} href={shopHref} now={now} top={theme.settings.collectionTop} lang={shop.shopLanguage} />
      <JsonLd data={breadcrumbJsonLd([{ name: shop.shopName, url: `${base}/` }, { name: c.title, url: `${base}/collections/${c.handle}` }])} />
      <JsonLd data={itemListJsonLd(inCollection(c, cat.products, now).slice(0, 24).map((p) => `${base}/products/${p.handle}`))} />
    </>
  )
}
