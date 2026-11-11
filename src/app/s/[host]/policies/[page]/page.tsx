import type { Metadata } from 'next'
import { pageDescription } from '@/domains/seo/defaults'
import { notFound } from 'next/navigation'
import { shareImage } from '@/lib/seo/share-image'
import { PolicyView } from '@/components/storefront/pages'
import { POLICY_TITLE } from '@/components/storefront/policy'
import { ShopShell } from '@/components/storefront/shell'
import { shopCatalogue } from '@/lib/queries/storefront'
import { shopTheme } from '@/lib/themes/page-look'
import type { PolicyPage } from '@/domains/policies/render'
import { shopFor, shopHref } from '../../_shop'
import { shopTags, toMetadata } from '../../_meta'

// Policies are live before the shop opens: payment providers read them during KYC.
export const revalidate = 60
export const generateStaticParams = () => []

type Params = Promise<{ host: string; page: string }>
/** Own keys only: `/policies/constructor` must 404, not reach a built-in (security review 2026-11-11 L1). */
const isPage = (p: string): p is PolicyPage => Object.hasOwn(POLICY_TITLE, p)

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
  const theme = await shopTheme(shop)
  return <ShopShell shop={shop} href={shopHref} theme={theme} gated={!shop.publishedAt} capture={!!shop.publishedAt}><PolicyView shop={shop} page={page} contact={theme.contact} /></ShopShell>
}
