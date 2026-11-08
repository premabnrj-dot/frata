import 'server-only'
import { paperAccent } from '@/domains/documents/paper'
import { shopLook, shopSettingsFor } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import type { Brand } from './pdf/blocks'

/**
 * A shop's brand on paper (Documents D1): its name, its look's colour where it reads on white (paperAccent), and its
 * support contact for the footer — from the cached shop loaders the storefront reads, so a document and the shop
 * agree. The logo for paper comes with D2 (Settings › Documents).
 */
export async function brandFor(tenantId: string): Promise<{ brand: Brand; contact: string } | null> {
  const shop = await shopSettingsFor(tenantId)
  if (!shop) return null
  const theme = themeOf(shop, await shopLook(tenantId))
  const contact = [shop.supportEmail, shop.supportPhone].filter(Boolean).join(' · ') || shop.legalName || shop.shopName
  return { brand: { name: shop.shopName, accent: paperAccent(theme.schemes.paper.accent), logo: null }, contact }
}
