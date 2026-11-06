'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { PLAN_CODES } from '@/domains/plans/entitlements'
import { createMerchant, slugTaken } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { sendSignInLink } from '@/lib/auth/send-link'
import { SHOP_DOMAIN } from '@/lib/public-env'

const NewMerchant = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'Letters, digits and hyphens'),
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
  if (await slugTaken(staff, m.slug)) return back(`${m.slug}.${SHOP_DOMAIN} is taken. Choose another shop address.`)
  let id: string
  try {
    ;({ id } = await createMerchant(staff, { ...m, host: `${m.slug}.${SHOP_DOMAIN}`, now: new Date() }))
  } catch (err) {
    console.error('[createMerchantAction]', err)
    return back('We could not add the merchant. Nothing was saved.')
  }
  const link = await sendSignInLink(m.ownerEmail)
  redirect(`/admin/merchants/${id}?ok=${encodeURIComponent(link.sent ? `Added. ${m.ownerEmail} has a sign-in link.` : `Added, but the sign-in email failed: ${link.error} Use "Resend sign-in link".`)}`)
}
