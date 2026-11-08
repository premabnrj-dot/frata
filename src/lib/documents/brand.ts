import 'server-only'
import { paperAccent } from '@/domains/documents/paper'
import { shopLook, shopSettingsFor } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import type { Paper } from '@/lib/orders/documents'
import { docImage } from './images'
import type { Brand } from './pdf/blocks'

/**
 * A shop's brand on paper (Documents D1–D2): its name, its look's colour where it reads on white (paperAccent), its
 * logo for paper as bytes, the signatory and note from Settings › Documents, and its support contact for the footer.
 * The colour and contact come from the cached shop loaders the storefront reads, so a document and the shop agree.
 */
export async function brandFor(tenantId: string, paper: Paper): Promise<{ brand: Brand; contact: string } | null> {
  const shop = await shopSettingsFor(tenantId)
  if (!shop) return null
  const [look, logo] = await Promise.all([shopLook(tenantId), docImage(paper.logo, tenantId)])
  const theme = themeOf(shop, look)
  const contact = [shop.supportEmail, shop.supportPhone].filter(Boolean).join(' · ') || shop.legalName || shop.shopName
  return { brand: { name: shop.shopName, accent: paperAccent(theme.schemes.paper.accent), logo, signatory: paper.signatory || undefined, note: paper.note || undefined }, contact }
}

/** Each invoice keeps the logo it was packed with (orders.invoice_logo), whatever the logo for paper became. */
export async function invoiceLogos(tenantId: string, urls: (string | null)[]): Promise<Map<string, Uint8Array | null>> {
  const unique = [...new Set(urls.filter((u): u is string => !!u))]
  return new Map(await Promise.all(unique.map(async (u) => [u, await docImage(u, tenantId)] as const)))
}
