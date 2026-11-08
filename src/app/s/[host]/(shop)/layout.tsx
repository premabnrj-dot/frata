import { OpeningSoon } from '@/components/storefront/pages'
import { ShopShell } from '@/components/storefront/shell'
import { AnnounceBar } from '@/components/storefront/announce-bar'
import { shopAnnouncement } from '@/lib/queries/storefront'
import { shopFor, shopHref } from '../_shop'

/** Every shop page but the policies: "Opening soon" until the shop publishes. */
export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  if (!shop.publishedAt) return <ShopShell shop={shop} href={shopHref} gated><OpeningSoon shop={shop} href={shopHref} /></ShopShell>
  // The offer the merchant put in the bar (offers O·1); a read that fails shows no bar, never an error page.
  const announce = await shopAnnouncement(shop.id).catch(() => null)
  return <ShopShell shop={shop} href={shopHref} live banner={<AnnounceBar a={announce} />}>{children}</ShopShell>
}
