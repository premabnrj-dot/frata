import 'server-only'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { frrataEmail } from '@/domains/email/layouts'
import { staffSecurityWords } from '@/domains/email/staff-security'
import { EMAIL_NOTICES_FROM, SES_CONFIG_NOTICES, isEmailConfigured } from '@/lib/env'
import { CONSOLE_HOST } from '@/lib/public-env'
import { errName } from '@/lib/log'
import { sendEmail } from '@/lib/email/ses'

// =============================================================================
// FILE: src/lib/admin/staff-notices.ts — sends the staff security emails the passkey definers queued
// (drizzle/0109 staff_notices; staff passkeys spec § Design 5). Claimed and settled through definers that only
// frata_admin may call: these emails are how a takeover of Admin gets noticed, so the shops' role can neither read nor
// silence them (security re-review F2). A claim holds its rows 2 minutes, so the drain and the send right after a
// change never send one twice; 5 tries each; a throttled SES leaves the row for the next pass (every 5 minutes, and right after
// each passkey action). No notices sender configured: the rows wait, and Admin › Activity still shows every change.
// =============================================================================

type NoticeRow = { id: string; to_email: string; kind: 'staff_added' | 'staff_removed' | 'request_approved' | 'passkey_added' | 'passkey_removed'; about: string; by_email: string | null; detail: string | null }
const claim = async (limit: number): Promise<NoticeRow[]> => [...await adminDb().execute<NoticeRow>(sql`select * from app_staff_notices_claim(${limit})`)]
const settle = async (id: string, ok: boolean, error: string | null) => { await adminDb().execute(sql`select app_staff_notices_settle(${id}::uuid, ${ok}, ${error})`) }

export async function sendStaffNotices(limit = 20): Promise<number> {
  if (!EMAIL_NOTICES_FROM || !isEmailConfigured()) return 0
  const rows = await claim(limit)
  let sent = 0
  for (const r of rows) {
    const w = staffSecurityWords({ kind: r.kind, about: r.about, by: r.by_email, detail: r.detail })
    const mail = frrataEmail({ preview: w.subject, heading: w.subject, message: w.body, button: { label: 'Open Admin › Staff', href: `https://${CONSOLE_HOST}/admin/staff` },
      footer: 'Security emails about Frrata staff always reach every admin. Not expected? Check Admin › Staff now.' })
    const s = await sendEmail({ from: EMAIL_NOTICES_FROM, to: r.to_email, replyTo: null, subject: w.subject.slice(0, 150), html: mail.html, text: mail.text,
      configurationSet: SES_CONFIG_NOTICES, tenant: 'frrata', messageId: randomUUID(), tenantTag: 'staff' }, new Date())
      .catch((e) => { console.error('[staff-notices] send', errName(e)); return { ok: false as const, retry: true, code: 'network' } })
    await settle(r.id, s.ok, s.ok ? null : s.code)
    if (s.ok) sent++
  }
  return sent
}
