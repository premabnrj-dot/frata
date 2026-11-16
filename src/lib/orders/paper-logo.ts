import 'server-only'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { afterMainLogo } from '@/lib/media/brand-files'
import { renditionUrl } from '@/lib/media/rendition'
import { hasCodeSite } from '@/domains/brand/code-site'

/**
 * The brand's logo for paper (one-address P1·4; spec § 5: invoices and slips read `doc_logo`, else the PNG rendition):
 * for a code-site store with a main logo, its rendition's URL; else null (a theme shop: nothing new, O19). One statement
 * inside the caller's transaction (packing freezes it before the invoice counter moves; slips read it beside their
 * settings). A missing file is made after the response, so the next print has it; the URL is derived from the logo.
 */
export async function brandPaperLogoWith(tx: Tx, tenantId: string): Promise<string | null> {
  const [r] = await tx.execute<{ logo_url: string | null; site_origin: string | null; keys: number }>(sql`
    select s.logo_url, s.site_origin, (select count(*)::int from storefront_keys k where k.tenant_id = s.tenant_id and k.revoked_at is null
      and (k.expires_at is null or k.expires_at > now())) as keys
    from shop_settings s where s.tenant_id = ${tenantId}`)
  if (!r?.logo_url || !hasCodeSite({ siteOrigin: r.site_origin, liveKeys: Number(r.keys) })) return null
  afterMainLogo(tenantId, r.logo_url)
  return renditionUrl(tenantId, r.logo_url)
}
