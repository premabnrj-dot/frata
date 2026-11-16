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
      {/* As drawn: the store's name in a bar with a rule under it, then the one state, centred. */}
      <header className="border-b border-store-line py-4 text-center text-lg font-semibold" style={{ fontFamily: 'var(--store-display)' }}>{shop.shopName}</header>
      <main className="grid min-h-[60vh] place-items-center px-4 py-16 text-center">{children}</main>
    </div>
  )
}
