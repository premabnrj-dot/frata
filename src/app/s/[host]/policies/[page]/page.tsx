import type { Metadata } from 'next'
import { pageDescription } from '@/domains/seo/defaults'
import { notFound } from 'next/navigation'
import { shareImage } from '@/lib/seo/share-image'
import { PolicyView } from '@/components/storefront/pages'
import { POLICY_TITLE } from '@/components/storefront/policy'
import { ShopShell } from '@/components/storefront/shell'
import { shopCatalogue, shopLook } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import type { PolicyPage } from '@/domains/policies/render'
import { shopFor, shopHref } from '../../_shop'
import { shopTags, toMetadata } from '../../_meta'

// Policies are live before the shop opens: payment providers read them during KYC.
export const revalidate = 60
export const generateStaticParams = () => []

type Params = Promise<{ host: string; page: string }>
const isPage = (p: string): p is PolicyPage => p in POLICY_TITLE

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const shop = await shopFor(params)
  const { page } = await params
  if (!isPage(page)) notFound()
  return toMetadata(shopTags(shop, { path: `/policies/${page}`, title: `${POLICY_TITLE[page]} | ${shop.shopName}`, shareTitle: POLICY_TITLE[page], description: pageDescription.policy(POLICY_TITLE[page], shop.shopName), image: await shareImage(shop, { kind: 'shop', cat: await shopCatalogue(shop.id) }, shop.shopName, new Date()) }))
}

export default async function Policy({ params }: { params: Params }) {
  const shop = await shopFor(params)
  const { page } = await params
  if (!isPage(page)) notFound()
  return <ShopShell shop={shop} href={shopHref} theme={themeOf(shop, await shopLook(shop.id))} gated={!shop.publishedAt} capture={!!shop.publishedAt}><PolicyView shop={shop} page={page} /></ShopShell>
}
