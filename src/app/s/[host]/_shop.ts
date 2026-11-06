import 'server-only'
import { notFound } from 'next/navigation'
import { shopHostParam } from '@/domains/tenancy/host'
import { isDatabaseConfigured } from '@/lib/env'
import { shopIdForHost, shopSettingsFor, type StoreShop } from '@/lib/queries/storefront'

/** A shop page's shop, from the route's host (written only by the middleware, checked for shape here). 404 for anything else. */
export async function shopFor(params: Promise<{ host: string }>): Promise<StoreShop> {
  return (await shopForRoute(params)) ?? notFound()
}

/** The same, null for no shop: route handlers answer their own uncached 404. */
export async function shopForRoute(params: Promise<{ host: string }>): Promise<StoreShop | null> {
  const host = shopHostParam((await params).host)
  if (!host || !isDatabaseConfigured()) return null
  const id = await shopIdForHost(host)
  return id ? shopSettingsFor(id) : null
}

/** Links on a shop are its own paths (the middleware adds /s/<host>). */
export const shopHref = (path: string) => path

/** Search engines: a shop that is opening soon is not indexed. */
export const robotsFor = (shop: StoreShop, indexable = true) => (shop.publishedAt && indexable ? undefined : { index: false, follow: false })
