'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BRANDS_NOW, PARTNER_SERVICES } from '@/domains/partners/terms'
import { requireUser } from '@/lib/auth/require-user'
import { applyAsPartner } from '@/lib/db/partners'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp } from '@/lib/http/client-ip'

// Apply to be a partner (approved mockup screen 2). Asks only what review uses; PAN and bank wait for the first
// share. The uid is getUser()'s; app_partner_apply writes the caller's own row and refuses a decided one.

const SERVICES = PARTNER_SERVICES.map(([k]) => k) as [string, ...string[]]
const BRANDS = BRANDS_NOW.map(([k]) => k) as [string, ...string[]]

const Application = z.object({
  name: z.string().trim().min(1, 'Your name').max(80),
  businessName: z.string().trim().max(80).default(''),
  phone: z.string().transform((s) => s.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '')).pipe(z.string().regex(/^[6-9]\d{9}$/, 'A 10-digit mobile number')),
  city: z.string().trim().min(1, 'Your city').max(60),
  services: z.array(z.enum(SERVICES)).max(SERVICES.length).default([]),
  workUrl: z.string().trim().max(200).default(''),
  brandsNow: z.enum(BRANDS, { message: 'Choose one' }),
  agree: z.literal(true, { message: 'Agree to the partner terms' }),
})

export type ApplyResult = { ok: true } | { ok: false; error: string; errors?: Record<string, string> }

export async function applyAction(input: unknown): Promise<ApplyResult> {
  const auth = await requireUser()
  if (!auth.ok) return { ok: false, error: auth.message }
  const p = Application.safeParse(input)
  if (!p.success) {
    const errors: Record<string, string> = {}
    for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message
    return { ok: false, error: 'Check the highlighted fields.', errors }
  }
  if (!(await withinLimit(LIMITS.createShopIp, await clientIp()))) return { ok: false, error: 'Too many tries from here. Try again later.' }
  const r = await applyAsPartner(auth.userId, { ...p.data, phone: `91${p.data.phone}` })
  if (!r.ok) {
    return { ok: false, error: r.error === 'decided' ? 'Your application is already decided.' : r.error === 'email_unconfirmed' ? 'Confirm your email first.' : 'We could not send it. Nothing was changed.' }
  }
  revalidatePath('/partners/apply')
  return { ok: true }
}
