import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { GoneView } from '@/components/storefront/pages'
import { shareImage } from '@/lib/seo/share-image'
import { productOffer, productSeo, ProductView } from '@/components/storefront/product-view'
import { ProductTags } from '@/components/storefront/product-tags'
import type { StoreProduct, StoreShop } from '@/lib/queries/storefront'
import { visibility, type Status } from '@/domains/catalogue/availability'
import { shopCatalogue, shopLook, shopProduct } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import { shopFor, shopHref } from '../../../_shop'
import { shopTags, toMetadata } from '../../../_meta'

export const revalidate = 60
export const generateStaticParams = () => []

type Params = Promise<{ host: string; handle: string }>
const HANDLE = /^[a-z0-9-]{1,100}$/

/** The product, as a shopper may see it now: an old handle moves (308), a draft or a scheduled drop is not here. */
async function load(params: Params) {
  const shop = await shopFor(params)
  const { handle } = await params
  if (!HANDLE.test(handle)) notFound()
  const r = await shopProduct(shop.id, handle)
  if (r.kind === 'moved') permanentRedirect(`/products/${r.to}`)
  if (r.kind === 'none') notFound()
  const v = visibility(r.product.status as Status, r.product.publishAt ? new Date(r.product.publishAt) : null, new Date())
  if (!v.reachable && !v.gone) notFound()
  return { shop, p: r.product, v }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { shop, p, v } = await load(params)
  if (v.gone) return { title: { absolute: `${p.title} | ${shop.shopName}` }, robots: { index: false, follow: true } }
  return toMetadata(await tagsOf(shop, p, v.indexable, new Date()))
}

/** The product page's tags: one builder for the head and the product:* tags in the page. */
async function tagsOf(shop: StoreShop, p: StoreProduct, indexable: boolean, now: Date) {
  const seo = productSeo(shop, p)
  const offer = productOffer(p, now)
  return shopTags(shop, {
    path: `/products/${p.handle}`, title: seo.title, shareTitle: seo.title.replace(/\s*\|[^|]*$/, ''), description: seo.description, indexable,
    image: await shareImage(shop, { kind: 'product', product: p }, p.images[0]?.alt || p.title, now),
    ...(offer ? { product: offer } : {}),
  })
}

export default async function ProductPage({ params }: { params: Params }) {
  const { shop, p, v } = await load(params)
  const now = new Date()
  // Archived: the shopper reads that it has gone, with new pieces below; noindex drops it from search (spec § Review findings).
  if (v.gone) return <GoneView title={p.title} cat={await shopCatalogue(shop.id)} href={shopHref} now={now} lang={shop.shopLanguage} />
  const theme = themeOf(shop, await shopLook(shop.id))
  return <><ProductTags tags={await tagsOf(shop, p, v.indexable, now)} /><ProductView shop={shop} p={p} now={now} live layout={theme.settings} /></>
}
