import 'server-only'
import { createHash } from 'node:crypto'
import type { ResolvedTheme } from '@/domains/themes/types'
import type { StoreShop } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/lib/seo/icon.ts — A SHOP'S OWN TAB AND HOME-SCREEN ICON (search and sharing S1·6).
// The logo (Settings › Brand) centred on a square of the theme's tint, or the shop's initial when there is none.
// Never Frrata's mark (brand spec: a shop's tab is the shop's). Its hash covers what is drawn, so a new logo is a new
// address and browsers fetch it.
// =============================================================================

export const ICON_SIZES = [32, 180, 192, 512] as const
export type IconSize = (typeof ICON_SIZES)[number]
export const ICON_VERSION = 1

export type IconContent = { logo: string | null; initial: string; bg: string; fg: string }

export function iconContent(shop: StoreShop, theme: ResolvedTheme): IconContent {
  const initial = [...shop.shopName.trim()][0]?.toUpperCase() ?? 'S'
  return { logo: shop.logoUrl, initial, bg: theme.schemes.tint.bg, fg: theme.schemes.tint.text }
}

export const iconHash = (c: IconContent) => createHash('sha256').update(JSON.stringify([ICON_VERSION, c])).digest('hex').slice(0, 16)
export const iconPath = (c: IconContent, size: IconSize) => `/icon/${size}/${iconHash(c)}.png`
