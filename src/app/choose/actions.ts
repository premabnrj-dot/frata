'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { currentStore, TENANT_COOKIE } from '@/lib/auth/require-member'

/**
 * F3 · switch store. The id comes from the form, but it only SELECTS among the stores app_access_for returned for
 * this signed-in person (ADR-0007): an id that is not one of them changes nothing. The same setter for "Open store"
 * on the partner's Clients list. A support visit is started and ended in Admin, never here.
 * On `console.open` (T1c): a Builder chooses among the same person's stores, the ones it builds included, so a Builder's
 * store never strands its person (security review M5).
 */
/** Where Open store may land besides Home. */
const OPEN_AT = ['/console/content', '/console/settings/website', '/partner/studio'] as const

export async function switchStoreAction(form: FormData) {
  // The person's own stores, both lists (currentStore: the same read requireMember and requireCapability make).
  const c = await currentStore()
  const id = z.uuid().safeParse(form.get('tenantId'))
  if (c.kind === 'none' || !id.success) redirect('/console')
  const all = c.kind === 'member' ? c.result.all : c.all
  const builds = c.kind === 'member' ? c.result.builds : c.builds
  const target = all.find((m) => m.tenantId === id.data && !m.supportSessionId) ?? builds.find((b) => b.tenantId === id.data)
  if (target) (await cookies()).set(TENANT_COOKIE, target.tenantId, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  // A partner's client page opens the store on Content or Website keys (P2): only these named console pages, never a
  // path from the form, so the switch can't be turned into an open redirect.
  const to = form.get('to')
  redirect(target && typeof to === 'string' && (OPEN_AT as readonly string[]).includes(to) ? to : '/console')
}
