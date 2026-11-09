import { ShopFrame } from '../_frame'

/** The checkout: the shop's look, focused when the theme's checkout is Focused (ShopFrame). No page entrance here. */
export default function CheckoutLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  return <ShopFrame params={params} checkout>{children}</ShopFrame>
}
