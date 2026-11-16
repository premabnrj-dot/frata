import 'server-only'
import { sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import type { StaffOk } from '@/lib/auth/require-staff'
import type { ApiShopRow } from '@/domains/storefront-api/admin-view'

// Frrata Admin › Storefront API (SA1b D·8): through two definers that answer counts and dates only (drizzle/0146);
// frata_admin holds nothing on storefront_keys and never reads a key, its name or its hash (ADR-0018 § 3).

type Raw = { tenant_id: string; name: string; slug: string; site_host: string | null; main_host: string | null; published: boolean
  opened_at: Date | string | null; live_keys: number; test_keys: number; last_read: Date | string | null; last_version: string | null; partner: string | null }

const day = (v: Date | string | null) => (v === null ? null : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10))

export async function apiShops(staff: StaffOk): Promise<ApiShopRow[]> {
  void staff
  const rows = await adminDb().execute<Raw>(sql`select * from admin_storefront_api_shops()`)
  return rows.map((r) => ({
    tenantId: r.tenant_id, name: r.name, slug: r.slug, siteHost: r.site_host, mainHost: r.main_host, published: r.published,
    openedAt: r.opened_at === null ? null : new Date(r.opened_at), liveKeys: r.live_keys, testKeys: r.test_keys,
    lastRead: day(r.last_read), lastVersion: r.last_version, partner: r.partner,
  }))
}

/** One store's listed products (the D3 signal), only for the store in view (speed review 4: 141 ms for every store). */
export async function apiShopListed(staff: StaffOk, tenantId: string): Promise<number> {
  void staff
  const [r] = await adminDb().execute<{ n: number }>(sql`select admin_storefront_api_listed(${tenantId}::uuid) as n`)
  return r?.n ?? 0
}
