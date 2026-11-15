import { shopFor } from '../_shop'

/**
 * The bag link's page alone (Storefront API SA1b, speed review 7): outside (checkout), whose frame reads the look, the
 * content, the offer bar and the catalogue for a page a shopper sees for under a second. One cached store read: its
 * name. The store's theme tokens come from [data-store-theme]'s defaults.
 */
export default async function CartLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return (
    <div data-store-theme="" lang={shop.shopLanguage === 'hi' ? 'hi' : undefined} className="min-h-dvh bg-store-paper text-store-ink">
      <main className="grid min-h-[50vh] place-items-center py-16 text-center"><div className="space-y-3">
        <p className="text-4xl sm:text-5xl" style={{ fontFamily: 'var(--store-display)' }}>{shop.shopName}</p>{children}</div></main>
    </div>
  )
}
