import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { readCapped } from '@/lib/http/capped'
import { hookSigned, type HookPayload } from '@/lib/email/hook'
import { sendEmail } from '@/lib/email/ses'
import { frrataEmail } from '@/domains/email/layouts'
import { cleanEmail } from '@/domains/email/shape'
import { EMAIL_NOTICES_FROM, SES_CONFIG_NOTICES } from '@/lib/env'

// ENTRY POINT credential: Supabase's Send Email Hook, signed with SEND_EMAIL_HOOK_SECRET (Standard Webhooks;
// src/lib/email/hook.ts; scripts/check-actions.mjs). Supabase hands us each sign-in email; we send it through SES in
// Frrata's layout (ADR-0011: no SMTP key anywhere). The link goes to Supabase's verify endpoint, which returns to our
// /auth/callback; the 6-digit code works in any browser.
export const dynamic = 'force-dynamic'
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
  const changing = d.email_action_type === 'email_change'
  const to = cleanEmail(changing ? p.user?.new_email : p.user?.email)
  const code = changing ? d.token_new : d.token
  const hash = changing ? d.token_hash_new : d.token_hash
  const site = typeof d.site_url === 'string' && /^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9/_-]*)?$/i.test(d.site_url) ? d.site_url.replace(/\/$/, '') : null
  if (!to || !code || !/^\d{6,10}$/.test(code) || !hash || !site) return fail(400, 'Bad payload')
  const link = `${site}/verify?${new URLSearchParams({ token: hash, type: String(d.email_action_type ?? 'magiclink'), redirect_to: String(d.redirect_to ?? '') })}`
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
  if (!sent.ok) { console.error('[send-email hook]', sent.code); return fail(502, 'Could not send') }
  return NextResponse.json({})
}

