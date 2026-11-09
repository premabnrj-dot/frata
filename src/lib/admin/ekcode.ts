import 'server-only'
import { sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import type { StaffOk } from '@/lib/auth/require-staff'
import { phoneKeys } from '@/lib/ekcode/keys'
import { cleanMobile } from '@/domains/checkout/mobile'

// =============================================================================
// FILE: src/lib/admin/ekcode.ts — ADMIN › EKCODE (P1 task 10): counts, costs and controls, through the admin definers
// only (drizzle/0087). Staff never list shoppers or read an address; every write carries a reason into the audit log.
// =============================================================================

export type EkStats = { accounts: number; active: number | null; multi_shop: number | null; started: number; codes: number; delivered: number; verified: number; created: number; continued: number; peak_minute: number; codes_month: number }
export type EkShop = { tenant_id: string; shop: string; plan: string | null; started: number | null; codes: number | null; verified: number | null; continued: number | null; delivered_month: number; breaker_at: Date | null; paused_at: Date | null; raised_cap: number | null }
export type EkSettings = { version: number; sign_in: boolean; limits: Record<string, unknown>; reason: string; at: Date }

const num = <T extends Record<string, unknown>>(r: T) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v])) as T

export async function ekStats(staff: StaffOk, days: 1 | 7 | 30): Promise<EkStats | null> {
  const rows = (await adminDb().execute(sql`select * from app_admin_ekcode_stats(${staff.userId}::uuid, ${days}::int)`)) as unknown as EkStats[]
  return rows[0] ? num(rows[0]) : null
}
export async function ekShops(staff: StaffOk, days: 1 | 7 | 30): Promise<EkShop[]> {
  return ((await adminDb().execute(sql`select * from app_admin_ekcode_shops(${staff.userId}::uuid, ${days}::int)`)) as unknown as EkShop[]).map(num)
}
export async function ekSettings(staff: StaffOk): Promise<EkSettings | null> {
  return ((await adminDb().execute(sql`select * from app_admin_ekcode_settings(${staff.userId}::uuid)`)) as unknown as EkSettings[])[0] ?? null
}
export async function ekBlocks(staff: StaffOk) {
  return (await adminDb().execute(sql`select * from app_admin_ekcode_blocks(${staff.userId}::uuid)`)) as unknown as { kind: string; key_hash: string; reason: string; at: Date }[]
}
export async function ekSetLimits(staff: StaffOk, signIn: boolean, limits: Record<string, unknown>, reason: string) {
  await adminDb().execute(sql`select app_admin_ekcode_set(${staff.userId}::uuid, ${signIn}, ${JSON.stringify(limits)}::jsonb, ${reason})`)
}
export async function ekShopControl(staff: StaffOk, tenantId: string, action: 'pause' | 'resume' | 'raise' | 'reset', value: number | null, reason: string) {
  await adminDb().execute(sql`select app_admin_ekcode_shop(${staff.userId}::uuid, ${tenantId}::uuid, ${action}, ${value}::int, ${reason})`)
}
/** Block or lift a number (typed by staff; only its keyed hash reaches the database). */
export async function ekBlockNumber(staff: StaffOk, typed: string, lift: boolean, reason: string): Promise<boolean> {
  const mobile = cleanMobile(typed)
  if (!mobile) return false
  await adminDb().execute(sql`select app_admin_ekcode_block(${staff.userId}::uuid, 'phone', ${phoneKeys(mobile).write}, ${lift}, ${reason})`)
  return true
}
