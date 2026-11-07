import { OpeningSoon } from '@/components/storefront/pages'
import { ShopShell } from '@/components/storefront/shell'
import { shopFor, shopHref } from '../_shop'

/** Every shop page but the policies: "Opening soon" until the shop publishes. */
export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  if (!shop.publishedAt) return <ShopShell shop={shop} href={shopHref} gated><OpeningSoon shop={shop} href={shopHref} /></ShopShell>
  return <ShopShell shop={shop} href={shopHref} live>{children}</ShopShell>
}
