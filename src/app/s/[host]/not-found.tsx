import { ShopNotFound } from '@/components/storefront/pages'

// Not-found pages get no params, so this is the plain shop 404 inside the theme.
export default function NotFound() {
  return <div data-store-theme="" className="min-h-dvh"><ShopNotFound href={(p) => p} /></div>
}
