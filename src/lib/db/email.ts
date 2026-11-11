import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

// =============================================================================
// FILE: src/lib/db/email.ts — THE EMAIL DEFINERS frata_app may call (drizzle/0091). Every other email read or write is
// a tenant query through withTenant (src/lib/queries/notices.ts, src/lib/email/notice-sender.ts).
// =============================================================================

/** Yesterday's and today's counts into email_daily; retention (cron, daily). */
export const emailDaily = () => db().execute(sql`select app_email_daily()`)

export type SesEventRow = { snsId: string; messageId: string; tenantTag: string; type: 'Delivery' | 'Bounce' | 'Complaint' | 'Reject'; providerId: string | null; bounce: 'permanent' | 'transient' | 'undetermined' | null; hash: string | null; at: Date }

/** Stores and applies one SES event, routed only by our message id (the shop tag is a cross-check). False: not ours. */
export async function storeSesEvent(e: SesEventRow): Promise<boolean> {
  const rows = await db().execute<{ ok: boolean }>(sql`select app_store_ses_event(${e.snsId}, ${e.messageId}::uuid, ${e.tenantTag}::uuid, ${e.type}, ${e.providerId}, ${e.bounce}, ${e.hash}, ${e.at.toISOString()}::timestamptz) as ok`)
  return rows[0]?.ok === true
}
