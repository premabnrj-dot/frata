'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { PINCODE_SHAPE, slugProblem } from '@/domains/signup/slug'
import { PARTNER_TERMS } from '@/domains/partners/terms'
import { TENANT_COOKIE } from '@/lib/auth/require-member'
import { requirePartner } from '@/lib/auth/require-partner'
import { createClientStore } from '@/lib/db/partners'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp } from '@/lib/http/client-ip'
import { hostFor, refreshHosts } from '@/lib/queries/storefront'

// A partner makes a client store (approved mockup screen 6). The uid is getUser()'s; app_partner_create_shop
// re-checks the approval, the cap of unopened stores and the address, and records the link with PARTNER_TERMS.

const Store = z.object({ name: z.string().trim().min(1).max(60), slug: z.string(), pickup: z.string().regex(PINCODE_SHAPE) })

const SENTENCES: Record<string, string> = {
  not_partner: 'Your partner account is not approved yet.',
  too_many: `You have ${PARTNER_TERMS.maxUnopened} stores that have not opened yet. Hand one over first.`,
  bad_name: 'The shop needs a name of up to 60 letters.',
  bad_slug: 'Letters, digits and hyphens, at least 3.',
  bad_pincode: 'A pincode is 6 digits and starts with 1 to 9.',
  slug_taken: 'That address is taken. Try another.',
}

export async function createClientStoreAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string; field?: 'name' | 'slug' | 'pickup' }> {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false, error: auth.message }
  const parsed = Store.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields.' }
  const { name, slug, pickup } = parsed.data
  if (slugProblem(slug)) return { ok: false, field: 'slug', error: SENTENCES.bad_slug! }
  if (!(await withinLimit(LIMITS.createShopIp, await clientIp()))) return { ok: false, error: 'Too many shops made from here in the last hour. Try again later.' }
  const r = await createClientStore(auth.userId, { name, slug, pickup })
  if (!r.ok) {
    const field = r.error === 'slug_taken' || r.error === 'bad_slug' ? 'slug' : r.error === 'bad_name' ? 'name' : r.error === 'bad_pincode' ? 'pickup' : undefined
    return { ok: false, field, error: SENTENCES[r.error] ?? 'We could not make the store. Nothing was changed.' }
  }
  refreshHosts(hostFor(slug))
  // Open the new store: it is one of this person's memberships now (app_access_for), so requireMember accepts it.
  ;(await cookies()).set(TENANT_COOKIE, r.tenantId, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  return { ok: true }
}
