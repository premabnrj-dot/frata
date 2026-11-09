import 'server-only'
import { SHARE_PRESETS, shopLink, type SharePreset } from '@/domains/analytics/link'
import { isListed } from '@/domains/storefront/listing'
import { shopCatalogue, shopSettingsFor } from '@/lib/queries/storefront'
import { pausedAt } from '@/lib/queries/trial-pause'
import type { CardSource } from './card'
import { shareImage } from './share-image'

// =============================================================================
// FILE: src/lib/seo/share.ts — WHAT THE CONSOLE'S SHARE BUTTON OFFERS (search and sharing S1·7).
// For the member's own shop (the tenant from requireMember, never a form): the page's address with each channel's
// tags (shopLink, the one link builder), its card, and the WhatsApp and Facebook share addresses. Shareable only
// when the shop is open and the page is listed: a link to "Opening soon" or a draft sells nothing.
// =============================================================================

export type ShareTarget = { kind: 'product'; id: string } | { kind: 'collection'; id: string } | { kind: 'shop' }
export type ShareData = {
  ready: boolean
  title: string
  /** The card shown in the sheet (the same image every app fetches); null when not shareable yet. */
  card: string | null
  links: Record<SharePreset, string>
  whatsapp: string
  facebook: string
}

export async function shareFor(tenantId: string, target: ShareTarget, now = new Date()): Promise<ShareData | null> {
  const shop = await shopSettingsFor(tenantId)
  if (!shop) return null
  const cat = await shopCatalogue(tenantId)
  let src: CardSource | null = null, path = '/', title = shop.shopName
  if (target.kind === 'product') {
    const p = cat.products.find((x) => x.id === target.id && isListed(x, now))
    if (p) { src = { kind: 'product', product: p }; path = `/products/${p.handle}`; title = p.title }
  } else if (target.kind === 'collection') {
    const c = cat.collections.find((x) => x.id === target.id)
    if (c) { src = { kind: 'collection', collection: c, cat }; path = `/collections/${c.handle}`; title = c.title }
  } else src = { kind: 'shop', cat }
  // Open to shoppers: published and not paused (a paused shop shows "Back soon", trials TR1·9).
  const ready = !!shop.publishedAt && !pausedAt(shop.pause, now) && !!src
  const origin = `https://${shop.host}`
  const links = Object.fromEntries((Object.keys(SHARE_PRESETS) as SharePreset[]).map((k) => [k, shopLink(origin, path, { preset: k })])) as Record<SharePreset, string>
  const card = ready && src ? (await shareImage(shop, src, title, now)).url : null
  return {
    ready, title, card, links,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${links.share_whatsapp}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(links.share_facebook)}`,
  }
}
