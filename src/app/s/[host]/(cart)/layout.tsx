import { shopFor } from '../_shop'

/**
 * The bag link's page alone (Storefront API SA1b, speed review 7): outside (checkout), whose frame reads the look, the
 * content, the offer bar and the catalogue for a page a shopper sees for under a second. One cached store read: its
 * name. The store's theme tokens come from [data-store-theme]'s defaults.
 */
export default async function CartLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const shop = await shopFor(params)
  return (
    <div data-store-theme="" lang={shop.shopLanguage === 'hi' ? 'hi' : undefined} className="flex min-h-dvh flex-col bg-store-paper text-store-ink">
      <header className="border-b border-current/10 px-4 py-4 text-center text-lg font-semibold">{shop.shopName}</header>
      <main className="grid flex-1 place-items-center px-6 py-10 text-center">{children}</main>
    </div>
  )
}
