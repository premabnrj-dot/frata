import { ShopFrame } from '../_frame'

/** Every shop page but the checkout, the orders and the policies: the shop's published look (ShopFrame). */
export default function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  return <ShopFrame params={params}>{children}</ShopFrame>
}
