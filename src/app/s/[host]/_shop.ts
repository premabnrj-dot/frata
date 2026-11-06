import 'server-only'
import { notFound } from 'next/navigation'
import { shopHostParam } from '@/domains/tenancy/host'
import { isDatabaseConfigured } from '@/lib/env'
import { shopIdForHost, shopSettingsFor, type StoreShop } from '@/lib/queries/storefront'

/** A shop page's shop, from the route's host (written only by the middleware, checked for shape here). 404 for anything else. */
export async function shopFor(params: Promise<{ host: string }>): Promise<StoreShop> {
  const host = shopHostParam((await params).host)
  if (!host || !isDatabaseConfigured()) notFound()
  const id = await shopIdForHost(host)
  if (!id) notFound()
  const shop = await shopSettingsFor(id)
  if (!shop) notFound()
  return shop
}

/** Links on a shop are its own paths (the middleware adds /s/<host>). */
export const shopHref = (path: string) => path

/** Search engines: a shop that is opening soon is not indexed. */
export const robotsFor = (shop: StoreShop, indexable = true) => (shop.publishedAt && indexable ? undefined : { index: false, follow: false })
