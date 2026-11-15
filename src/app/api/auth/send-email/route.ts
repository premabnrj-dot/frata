import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { readCapped } from '@/lib/http/capped'
import { hookSigned, type HookPayload } from '@/lib/email/hook'
import { sendEmail } from '@/lib/email/ses'
import { frrataEmail } from '@/domains/email/layouts'
import { cleanEmail } from '@/domains/email/shape'
import { EMAIL_NOTICES_FROM, SES_CONFIG_NOTICES } from '@/lib/env'
import { CONSOLE_HOST } from '@/lib/public-env'
import { isEmailLinkType, signInLink } from '@/domains/auth/email-link'

// ENTRY POINT credential: Supabase's Send Email Hook, signed with SEND_EMAIL_HOOK_SECRET (Standard Webhooks;
// src/lib/email/hook.ts; scripts/check-actions.mjs). Supabase hands us each sign-in email; we send it through SES in
// Frrata's layout (ADR-0011: no SMTP key anywhere). The link opens our /auth/confirm, which signs in only when the
// person presses "Sign in" (an email scanner that follows the link uses nothing; partner sign-in mockup screen 4), in
// any browser; the 6-digit code works anywhere too.
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const NO_TENANT = '00000000-0000-0000-0000-000000000000'

const fail = (status: number, message: string) => NextResponse.json({ error: { http_code: status, message } }, { status })

export async function POST(request: Request) {
  const body = await readCapped(request, 32 * 1024)
  if (body === null) return fail(413, 'Too large')
  const now = new Date()
  if (!hookSigned(body, request.headers.get('webhook-id'), request.headers.get('webhook-timestamp'), request.headers.get('webhook-signature'), now)) return fail(401, 'Unsigned')
  if (!EMAIL_NOTICES_FROM) return fail(500, 'Email is not set up')
  let p: HookPayload
  try { p = JSON.parse(body) as HookPayload } catch { return fail(400, 'Bad payload') }
  const d = p.email_data ?? {}
  const type = d.email_action_type ?? 'magiclink'
  // Only sign-in emails: an address change (or any other kind) is refused, never sent as a sign-in (security review M2).
  if (!isEmailLinkType(type)) return fail(400, 'Not a sign-in email')
  const to = cleanEmail(p.user?.email)
  const code = d.token
  const hash = d.token_hash
  if (!to || !code || !/^\d{6,10}$/.test(code) || !hash || !/^[A-Za-z0-9_-]{20,200}$/.test(hash)) return fail(400, 'Bad payload')
  const link = signInLink(CONSOLE_HOST, hash, type)
  const r = frrataEmail({
    preview: `Your sign-in code is ${code}`,
    heading: `Your sign-in code: ${code}`,
    message: 'Type this code where you asked to sign in, or tap the button in this same browser. It works for one hour.\nIf you didn\'t ask, ignore this email.',
    button: { label: 'Sign in', href: link },
    footer: 'Frrata · You get this because someone asked to sign in with this email.',
  })
  const sent = await sendEmail({
    from: EMAIL_NOTICES_FROM, to, replyTo: null, subject: `${code} is your Frrata sign-in code`, html: r.html, text: r.text,
    configurationSet: SES_CONFIG_NOTICES, tenant: 'frrata', messageId: randomUUID(), tenantTag: NO_TENANT,
  }, now)
  if (!sent.ok) { console.error('[send-email hook]', sent.code); return fail(502, 'Couldn’t send') }
  return NextResponse.json({})
}

