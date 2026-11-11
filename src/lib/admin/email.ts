import 'server-only'
import { sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import type { StaffOk } from '@/lib/auth/require-staff'

// =============================================================================
// FILE: src/lib/admin/email.ts — ADMIN › EMAIL HEALTH (email plan E·2): per-shop counts from the daily roll-up and the
// outbox's email queue, through the admin definers only (drizzle/0091). Staff never read an address or a message.
// =============================================================================

export type EmailHealthRow = { tenant_id: string; shop: string; sent: number; delivered: number; bounced: number; complained: number; skipped: number }
export type EmailQueue = { waiting: number; oldest: Date | null; dead_today: number }

const num = <T extends Record<string, unknown>>(r: T) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v])) as T

export async function emailHealth(staff: StaffOk, days: 1 | 7 | 30): Promise<EmailHealthRow[]> {
  return ((await adminDb().execute(sql`select * from app_admin_email_health(${staff.userId}::uuid, ${days}::int)`)) as unknown as EmailHealthRow[]).map(num)
}
export async function emailQueue(staff: StaffOk): Promise<EmailQueue> {
  const r = ((await adminDb().execute(sql`select * from app_admin_email_queue(${staff.userId}::uuid)`)) as unknown as EmailQueue[])[0]
  return r ? num(r) : { waiting: 0, oldest: null, dead_today: 0 }
}
