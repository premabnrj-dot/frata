'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { PLAN_CODES } from '@/domains/plans/entitlements'
import { slugProblem } from '@/domains/signup/slug'
import { createMerchant, slugTaken } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { sendSignInLink } from '@/lib/auth/send-link'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { errName } from '@/lib/log'

const NewMerchant = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().max(30),
  ownerEmail: z.email(),
  planCode: z.enum(PLAN_CODES),
  trialEndsAt: z.string().optional().transform((v) => (v ? new Date(`${v}T23:59:59+05:30`) : null)),
})

const back: (error: string) => never = (error) => redirect(`/admin/merchants/new?error=${encodeURIComponent(error)}`)

export async function createMerchantAction(form: FormData) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) back(staff.message)
  const parsed = NewMerchant.safeParse(Object.fromEntries(form))
  if (!parsed.success) return back('Check the brand name, shop address and email')
  const m = parsed.data
  // The same rule as sign-up and partners (shop addresses spec, D·0): shape, length, reserved words.
  const problem = slugProblem(m.slug)
  if (problem) return back(problem === 'reserved' ? `${m.slug} is kept for Frrata. Choose another shop address.` : 'Shop address: 3–30 letters, digits and single hyphens, not starting or ending with one.')
  if (await slugTaken(staff, m.slug)) return back(`${m.slug}.${SHOP_DOMAIN} is taken. Choose another shop address.`)
  let id: string
  try {
    ;({ id } = await createMerchant(staff, { ...m, now: new Date() }))
  } catch (err) {
    console.error('[createMerchantAction]', errName(err))
    return back('We could not add the merchant. Nothing was saved.')
  }
  const link = await sendSignInLink(m.ownerEmail)
  redirect(`/admin/merchants/${id}?ok=${encodeURIComponent(link.sent ? `Added. ${m.ownerEmail} has a sign-in link.` : `Added, but the sign-in email failed: ${link.error} Use "Resend sign-in link".`)}`)
}
