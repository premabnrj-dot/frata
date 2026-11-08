import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AllView } from '@/components/storefront/pages'
import { isListed, pageOf, pageParam } from '@/domains/storefront/listing'
import { shopCatalogue } from '@/lib/queries/storefront'
import { robotsFor, shopFor, shopHref } from '../../../../_shop'

// Page 2 onward of Shop all (speed review P2): its own address, so each page is cached on its own.
export const revalidate = 60
export const generateStaticParams = () => []

type Params = Promise<{ host: string; n: string }>

async function load(params: Params) {
  const shop = await shopFor(params)
  const page = pageParam((await params).n)
  if (!page) notFound()
  const cat = await shopCatalogue(shop.id)
  const now = new Date()
  if (page > pageOf(cat.products.filter((p) => isListed(p, now)), page).pages) notFound()
  return { shop, cat, page, now }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { shop, page } = await load(params)
  return { title: { absolute: `Shop all · page ${page} | ${shop.shopName}` }, alternates: { canonical: `https://${shop.host}/products/page/${page}` }, robots: robotsFor(shop) }
}

export default async function AllPage({ params }: { params: Params }) {
  const { shop, cat, page, now } = await load(params)
  return <AllView cat={cat} href={shopHref} now={now} lang={shop.shopLanguage} page={page} />
}
