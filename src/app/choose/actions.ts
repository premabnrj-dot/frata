'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { TENANT_COOKIE } from '@/lib/auth/require-member'
import { requireCapability } from '@/lib/auth/require-capability'

/**
 * F3 · switch store. The id comes from the form, but it only SELECTS among the stores app_access_for returned for
 * this signed-in person (ADR-0007): an id that is not one of them changes nothing. The same setter for "Open store"
 * on the partner's Clients list. A support visit is started and ended in Admin, never here.
 * On `console.open` (T1c): a Builder chooses among the same person's stores, the ones it builds included, so a Builder's
 * store never strands its person (security review M5).
 */
export async function switchStoreAction(form: FormData) {
  const auth = await requireCapability('console.open')
  const id = z.uuid().safeParse(form.get('tenantId'))
  if (!auth.ok || !id.success) redirect('/console')
  const all = auth.kind === 'member' ? auth.auth.all : auth.all
  const builds = auth.kind === 'member' ? auth.auth.builds : auth.builds
  const target = all.find((m) => m.tenantId === id.data && !m.supportSessionId) ?? builds.find((b) => b.tenantId === id.data)
  if (target) (await cookies()).set(TENANT_COOKIE, target.tenantId, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  redirect('/console')
}
