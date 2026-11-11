'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { NOTICE_TYPES, REQUIRED_TYPES } from '@/domains/email/notices'
import { sendNotice } from '@/lib/admin/notices'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { errName } from '@/lib/log'

const back = (k: 'ok' | 'error', m: string) => `/admin/notices?${k}=${encodeURIComponent(m)}`

const Input = z.object({
  audience: z.enum(['all', 'plan', 'shop']),
  plan: z.enum(['launch', 'growth', 'scale']).optional(),
  tenantId: z.uuid().optional().or(z.literal('')),
  type: z.enum(NOTICE_TYPES),
  title: z.string().trim().min(3).max(120),
  // Plain text only, and a link only into the console (security review S7).
  body: z.string().trim().max(1000).optional(),
  href: z.string().trim().regex(/^\/console(\/[A-Za-z0-9/_?=&.-]*)?$/).optional().or(z.literal('')),
  required: z.literal('on').optional(),
  email: z.literal('on').optional(),
})

export async function sendNoticeAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  const p = Input.safeParse(Object.fromEntries(form))
  if (!p.success) redirect(back('error', 'Check the title (3–120 characters), the audience and the link (a /console/ path).'))
  const d = p.data
  const required = d.required === 'on'
  if (required && !(REQUIRED_TYPES as readonly string[]).includes(d.type)) redirect(back('error', 'Only billing, security and Frrata-action notices can be required.'))
  if (d.audience === 'plan' && !d.plan) redirect(back('error', 'Choose a plan.'))
  if (d.audience === 'shop' && !d.tenantId) redirect(back('error', 'Choose a shop.'))
  let shops = 0
  try {
    shops = (await sendNotice(staff, { audience: d.audience, plan: d.audience === 'plan' ? d.plan! : null, tenantId: d.audience === 'shop' ? d.tenantId || null : null,
      type: d.type, title: d.title, body: d.body || null, href: d.href || null, required, email: required || d.email === 'on' })).shops
  } catch (err) {
    console.error('[admin notices]', errName(err))
    redirect(back('error', 'We could not send it. Nothing was sent.'))
  }
  redirect(back('ok', shops ? `Sent to ${shops} shop${shops === 1 ? '' : 's'}.` : 'No shop matched.'))
}
