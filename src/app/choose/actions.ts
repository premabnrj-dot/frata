'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { ANY_MEMBER, requireMember, TENANT_COOKIE } from '@/lib/auth/require-member'

/**
 * F3 · switch store. The id comes from the form, but it only SELECTS among the stores app_access_for returned for
 * this signed-in person (ADR-0007): an id that is not one of them changes nothing. The same setter for "Open store"
 * on the partner's Clients list. A support visit is started and ended in Admin, never here.
 */
export async function switchStoreAction(form: FormData) {
  const auth = await requireMember(ANY_MEMBER)
  const id = z.uuid().safeParse(form.get('tenantId'))
  if (!auth.ok || !id.success) redirect('/console')
  const target = auth.all.find((m) => m.tenantId === id.data && !m.supportSessionId)
  if (target) (await cookies()).set(TENANT_COOKIE, target.tenantId, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  redirect('/console')
}
