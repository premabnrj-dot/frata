import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { GoneView } from '@/components/storefront/pages'
import { productSeo, ProductView } from '@/components/storefront/product-view'
import { visibility, type Status } from '@/domains/catalogue/availability'
import { shopCatalogue, shopLook, shopProduct } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import { robotsFor, shopFor, shopHref } from '../../../_shop'

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
  const seo = productSeo(shop, p)
  return {
    title: { absolute: seo.title }, description: seo.description, alternates: { canonical: seo.url }, robots: robotsFor(shop, v.indexable),
    openGraph: { title: seo.title.replace(/\s*\|[^|]*$/, ''), description: seo.description, url: seo.url, siteName: shop.shopName, type: 'website', ...(seo.image ? { images: [{ url: seo.image, width: 1200 }] } : {}) },
  }
}

export default async function ProductPage({ params }: { params: Params }) {
  const { shop, p, v } = await load(params)
  const now = new Date()
  // Archived: the shopper reads that it has gone, with new pieces below; noindex drops it from search (spec § Review findings).
  if (v.gone) return <GoneView title={p.title} cat={await shopCatalogue(shop.id)} href={shopHref} now={now} lang={shop.shopLanguage} />
  const theme = themeOf(shop, await shopLook(shop.id))
  return <ProductView shop={shop} p={p} now={now} live layout={theme.settings} />
}
