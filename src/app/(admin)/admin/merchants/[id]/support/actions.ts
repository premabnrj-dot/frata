'use server'

// ⚠️ THE ONE SANCTIONED FORM-SUPPLIED TENANT ID (ADR-0007). The caller is
// verified staff choosing a merchant on purpose; the id is a UUID that must
// name an existing store; staff_user_id comes from requireStaff, never the form.
// The cookie only SELECTS — app_access_for decides whether it is honoured.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SUPPORT_LENGTHS_MIN, SUPPORT_REASONS } from '@/domains/support/session'
import { startSupport } from '@/lib/admin/support'
import { TENANT_COOKIE } from '@/lib/auth/require-member'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import type { ActionResult } from '@/components/ui/action-form'

const Start = z.object({
  tenantId: z.uuid(),
  reason: z.enum(SUPPORT_REASONS),
  note: z.string().trim().max(200).optional().transform((v) => v || null),
  minutes: z.coerce.number().pipe(z.union(SUPPORT_LENGTHS_MIN.map((n) => z.literal(n)) as [z.ZodLiteral<30>, z.ZodLiteral<60>, z.ZodLiteral<240>])),
})

// A refusal is said on this page (ActionForm's toast); the start itself sets the cookie and goes into the console.
export async function startSupportAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return { error: staff.message }
  const parsed = Start.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: 'Choose a reason and a length.' }
  const r = await startSupport(staff, { ...parsed.data, now: new Date() })
  if ('error' in r) return { error: r.error }
  ;(await cookies()).set(TENANT_COOKIE, parsed.data.tenantId, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: 4 * 60 * 60,
  })
  redirect('/console')
}
