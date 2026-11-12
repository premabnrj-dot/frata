'use server'

import { z } from 'zod'
import { PLAN_CODES } from '@/domains/plans/entitlements'
import { slugProblem } from '@/domains/signup/slug'
import { createMerchant, slugTaken } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { sendSignInLink } from '@/lib/auth/send-link'
import { shopHost } from '@/lib/public-env'
import { errName } from '@/lib/log'
import type { ActionResult } from '@/components/ui/action-form'

const NewMerchant = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().max(64),
  ownerEmail: z.email(),
  planCode: z.enum(PLAN_CODES),
  trialEndsAt: z.string().optional().transform((v) => (v ? new Date(`${v}T23:59:59+05:30`) : null)),
})

export async function createMerchantAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return { error: staff.message }
  const parsed = NewMerchant.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: 'Check the brand name, shop address and email.' }
  const m = parsed.data
  // The same rule as sign-up and partners (shop addresses spec, D·0): shape, length, reserved words.
  const problem = slugProblem(m.slug)
  if (problem) return { fields: { slug: problem === 'reserved' ? `${m.slug} is kept for Frrata. Choose another shop address.` : 'Shop address: 3–30 letters, digits and single hyphens, not starting or ending with one.' } }
  if (await slugTaken(staff, m.slug)) return { fields: { slug: `${shopHost(m.slug)} is taken. Choose another shop address.` } }
  let id: string
  try {
    ;({ id } = await createMerchant(staff, { ...m, now: new Date() }))
  } catch (err) {
    console.error('[createMerchantAction]', errName(err))
    return { error: 'We could not add the merchant. Nothing was saved.' }
  }
  const link = await sendSignInLink(m.ownerEmail)
  return { ok: link.sent ? `Added. ${m.ownerEmail} has a sign-in link.` : `Added, but the sign-in email failed: ${link.error} Use "Resend sign-in link".`, go: `/admin/merchants/${id}` }
}
