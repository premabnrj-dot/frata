import 'server-only'
import { createHash } from 'node:crypto'
import type { ResolvedTheme } from '@/domains/themes/types'
import type { StoreShop } from '@/lib/queries/storefront'
import type { ShopBrand } from '@/lib/queries/brand'
import { rasterLogo } from '@/lib/media/brand-files'

// =============================================================================
// FILE: src/lib/seo/icon.ts — A SHOP'S OWN TAB AND HOME-SCREEN ICON (search and sharing S1·6).
// The logo (Settings › Store details) centred on a square of the theme's tint, or the shop's initial when there is none.
// Never Frrata's mark (brand spec: a shop's tab is the shop's). Its hash covers what is drawn, so a new logo is a new
// address and browsers fetch it.
// =============================================================================

export const ICON_SIZES = [32, 180, 192, 512] as const
export type IconSize = (typeof ICON_SIZES)[number]
export const ICON_VERSION = 1

export type IconContent = { logo: string | null; initial: string; bg: string; fg: string }

/**
 * One-address P1·5: a code-site store's icon is its brand record's: the main logo on the record's background (an SVG
 * logo as its PNG rendition, which the icon route can draw), or, with no logo, the first letter on the accent (spec § 5).
 * A theme shop's is unchanged.
 */
export function iconContent(shop: StoreShop, theme: ResolvedTheme, brand: ShopBrand | null = null): IconContent {
  const initial = [...shop.shopName.trim()][0]?.toUpperCase() ?? 'S'
  if (brand) {
    const main = brand.record.logos.main, p = brand.record.palette
    const logo = rasterLogo(shop.id, main)
    return logo ? { logo, initial, bg: p.bg, fg: p.text } : { logo: null, initial, bg: p.accent, fg: p.on }
  }
  return { logo: shop.logoUrl, initial, bg: theme.schemes.tint.bg, fg: theme.schemes.tint.text }
}

export const iconHash = (c: IconContent) => createHash('sha256').update(JSON.stringify([ICON_VERSION, c])).digest('hex').slice(0, 16)
export const iconPath = (c: IconContent, size: IconSize) => `/icon/${size}/${iconHash(c)}.png`
