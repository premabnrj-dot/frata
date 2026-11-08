/**
 * Every shop page but the checkout and orders: a wrapper the theme's page entrance animates (2.0 choice, CSS only:
 * `.store-enter` in globals.css). A server component that reads nothing, so every page stays static; with no
 * entrance it is `display: contents` and adds no box.
 */
export default function ShopPageTemplate({ children }: { children: React.ReactNode }) {
  return <div className="store-enter">{children}</div>
}
