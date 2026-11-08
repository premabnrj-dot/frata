import 'server-only'
import { paperAccent } from '@/domains/documents/paper'
import { shopLook, shopSettingsFor } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import type { Paper } from '@/lib/orders/documents'
import { docImage } from './images'
import type { Brand } from './pdf/blocks'

/**
 * A shop's brand on paper (Documents D1–D2): its name, its look's colour where it reads on white (paperAccent), its
 * support contact for the footer, and (for slips; null for invoices, which carry their own frozen paper) today's logo,
 * signatory and note from Settings › Documents.
 * The colour and contact come from the cached shop loaders the storefront reads, so a document and the shop agree.
 */
export async function brandFor(tenantId: string, paper: Paper | null): Promise<{ brand: Brand; contact: string } | null> {
  const shop = await shopSettingsFor(tenantId)
  if (!shop) return null
  const [look, logo] = await Promise.all([shopLook(tenantId), docImage(paper?.logo ?? null, tenantId)])
  const theme = themeOf(shop, look)
  const contact = [shop.supportEmail, shop.supportPhone].filter(Boolean).join(' · ') || shop.legalName || shop.shopName
  return { brand: { name: shop.shopName, accent: paperAccent(theme.schemes.paper.accent), logo, signatory: paper?.signatory || undefined, note: paper?.note || undefined }, contact }
}

/** Each invoice as it froze at packing (orders.invoice_*): its logo as bytes, its signatory and note. */
export async function frozenPaper(tenantId: string, frozen: Paper[]): Promise<Pick<Brand, 'logo' | 'signatory' | 'note'>[]> {
  const unique = [...new Set(frozen.map((f) => f.logo).filter((u): u is string => !!u))]
  const bytes = new Map(await Promise.all(unique.map(async (u) => [u, await docImage(u, tenantId)] as const)))
  return frozen.map((f) => ({ logo: f.logo ? bytes.get(f.logo) ?? null : null, signatory: f.signatory || undefined, note: f.note || undefined }))
}
