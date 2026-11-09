import 'server-only'
import { CARD, cardOf, cardPath, type CardContent, type CardSource } from './card'
import type { ShareImage } from '@/domains/seo/tags'
import { shopLook, type StoreShop } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'

/** A page's share image: its card's current address on the shop's own host (S1·1 puts it in og:image). */
export async function shareImage(shop: StoreShop, src: CardSource, alt: string, now: Date): Promise<ShareImage> {
  const content = cardOf(shop, src, themeOf(shop, await shopLook(shop.id)), now)
  const id = src.kind === 'product' ? src.product.id : src.kind === 'collection' ? src.collection.id : null
  return { url: `https://${shop.host}${cardPath(content, id)}`, width: CARD.width, height: CARD.height, alt, type: 'image/jpeg' }
}

export type { CardContent }
