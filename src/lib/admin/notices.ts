import 'server-only'
import { sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import type { StaffOk } from '@/lib/auth/require-staff'

// Admin › Notices (email plan E·1, task 10): the fan-out runs in one definer (tenants from the audience, a notice and
// its outbox row each, audited); Admin holds no grant on notices or the outbox.

export type NoticeInput = { audience: 'all' | 'plan' | 'shop'; plan: string | null; tenantId: string | null; type: string; title: string; body: string | null; href: string | null; required: boolean; email: boolean }

export async function sendNotice(staff: StaffOk, n: NoticeInput): Promise<{ batch: string; shops: number }> {
  const rows = await adminDb().execute<{ batch: string; n: number }>(sql`select * from app_admin_notice_fanout(${staff.userId}::uuid, ${n.audience}, ${n.plan}, ${n.tenantId}::uuid,
    ${n.type}, ${n.title}, ${n.body}, ${n.href}, ${n.required}, ${n.email})`)
  return { batch: rows[0]!.batch, shops: Number(rows[0]!.n) }
}

export async function noticeBatches(staff: StaffOk) {
  const rows = await adminDb().execute<{ batch: string; title: string; type: string; required: boolean; shops: string; at: string }>(sql`select * from app_admin_notice_batches(${staff.userId}::uuid)`)
  return rows.map((r) => ({ batch: r.batch, title: r.title, type: r.type, required: r.required, shops: Number(r.shops), at: new Date(r.at) }))
}
