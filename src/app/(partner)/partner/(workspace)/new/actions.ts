'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { slugProblem } from '@/domains/signup/slug'
import { PARTNER_TERMS } from '@/domains/partners/terms'
import { TENANT_COOKIE } from '@/lib/auth/require-member'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerCan } from '@/domains/partners/team'
import { createClientStore } from '@/lib/db/partners'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp } from '@/lib/http/client-ip'
import { hostFor, refreshHosts } from '@/lib/queries/storefront'

// A partner makes a client store (approved mockup screen 6). The uid is getUser()'s; app_partner_create_shop_v2
// re-checks the approval, the cap of stores not handed over and the address, and records the link with PARTNER_TERMS.

const Store = z.object({ name: z.string().trim().min(1).max(60), slug: z.string() })

const SENTENCES: Record<string, string> = {
  not_partner: 'Your partner account is not approved yet.',
  too_many: `You have ${PARTNER_TERMS.maxUnopened} stores not handed over yet. Hand one over first.`,
  bad_name: 'The store needs a name of up to 60 letters.',
  bad_slug: 'Letters, numbers and hyphens, at least 3.',
  slug_taken: 'That address is taken. Try another.',
}

export async function createClientStoreAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string; field?: 'name' | 'slug' }> {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false, error: auth.message }
  if (!partnerCan(auth.partner.memberRole, 'createShop')) return { ok: false, error: 'Only your partner’s owner and Leads make client stores.' }
  const parsed = Store.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields.' }
  const { name, slug } = parsed.data
  if (slugProblem(slug)) return { ok: false, field: 'slug', error: SENTENCES.bad_slug! }
  if (!(await withinLimit(LIMITS.createShopIp, await clientIp()))) return { ok: false, error: 'Too many stores made from here in the last hour. Try again later.' }
  const r = await createClientStore(auth, { name, slug })
  if (!r.ok) {
    const field = r.error === 'slug_taken' || r.error === 'bad_slug' ? 'slug' : r.error === 'bad_name' ? 'name' : undefined
    return { ok: false, field, error: SENTENCES[r.error] ?? 'We couldn’t make the store. Nothing was changed.' }
  }
  refreshHosts(hostFor(slug))
  // Open the new store: it is one of this person's memberships now (app_access_for), so requireMember accepts it.
  ;(await cookies()).set(TENANT_COOKIE, r.tenantId, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  return { ok: true }
}
