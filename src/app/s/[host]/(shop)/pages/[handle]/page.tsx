import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { shareImage } from '@/lib/seo/share-image'
import { PageView } from '@/components/storefront/shop-pages'
import { pageDescription, resolvePage } from '@/domains/pages/page'
import { HANDLE } from '@/domains/pages/templates'
import { shopPageAt } from '@/lib/queries/pages'
import { shopCatalogue } from '@/lib/queries/storefront'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { shopFor, shopHref } from '../../../_shop'
import { shopTags, toMetadata } from '../../../_meta'

// Theme Studio TS1a: a shop's About or FAQ page. Cached per path like products; an address that isn't one of the
// shop's live pages is "page not found" from the cached list, with no query. Shares the shop's card (no card of its own).
export const revalidate = 60
export const generateStaticParams = () => []

type Params = Promise<{ host: string; handle: string }>

async function load(params: Params) {
  const shop = await shopFor(params)
  const { handle } = await params
  if (!HANDLE.test(handle)) notFound()
  const page = await shopPageAt(shop.id, handle)
  if (!page) notFound()
  return { shop, page }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { shop, page } = await load(params)
  const own = pageDescription(resolvePage(page.template, page.fill, 'shop', { facts: shop, overrides: shop.overrides, inr: (p) => formatInr(paise(p)) }))
  return toMetadata(shopTags(shop, { path: `/pages/${page.handle}`, title: `${page.title} | ${shop.shopName}`, shareTitle: page.title, description: own || `${page.title} at ${shop.shopName}.`,
    image: await shareImage(shop, { kind: 'shop', cat: await shopCatalogue(shop.id) }, shop.shopName, new Date()) }))
}

export default async function ShopPage({ params }: { params: Params }) {
  const { shop, page } = await load(params)
  return <PageView shop={shop} page={page} href={shopHref} />
}
