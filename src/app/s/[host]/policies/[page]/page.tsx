import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PolicyView } from '@/components/storefront/pages'
import { POLICY_TITLE } from '@/components/storefront/policy'
import { ShopShell } from '@/components/storefront/shell'
import { shopLook } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import type { PolicyPage } from '@/domains/policies/render'
import { robotsFor, shopFor, shopHref } from '../../_shop'

// Policies are live before the shop opens: payment providers read them during KYC.
export const revalidate = 60
export const generateStaticParams = () => []

type Params = Promise<{ host: string; page: string }>
const isPage = (p: string): p is PolicyPage => p in POLICY_TITLE

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const shop = await shopFor(params)
  const { page } = await params
  if (!isPage(page)) notFound()
  return { title: { absolute: `${POLICY_TITLE[page]} | ${shop.shopName}` }, alternates: { canonical: `https://${shop.host}/policies/${page}` }, robots: robotsFor(shop) }
}

export default async function Policy({ params }: { params: Params }) {
  const shop = await shopFor(params)
  const { page } = await params
  if (!isPage(page)) notFound()
  return <ShopShell shop={shop} href={shopHref} theme={themeOf(shop, await shopLook(shop.id))} gated={!shop.publishedAt}><PolicyView shop={shop} page={page} /></ShopShell>
}
