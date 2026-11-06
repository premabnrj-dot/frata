'use server'

import { z } from 'zod'
import { SELLS } from '@/lib/db/schema'
import { PINCODE_SHAPE, slugProblem } from '@/domains/signup/slug'
import { requireUser } from '@/lib/auth/require-user'
import { createShop, placeForPincode, slugAvailable } from '@/lib/db/platform'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp } from '@/lib/http/client-ip'

// Creating a shop: the signed-in person (requireUser → getUser) becomes its
// owner through app_create_shop, which re-checks everything in one transaction.

export type AddressCheck = { state: 'ok' } | { state: 'taken' | 'too_short' | 'shape' | 'reserved' }

export async function checkAddress(slug: string): Promise<AddressCheck> {
  const auth = await requireUser()
  if (!auth.ok) return { state: 'shape' }
  const s = String(slug ?? '').toLowerCase()
  const problem = slugProblem(s)
  if (problem) return { state: problem }
  if (!(await withinLimit(LIMITS.checkAddressUser, auth.userId))) return { state: 'taken' }
  return (await slugAvailable(s)) ? { state: 'ok' } : { state: 'taken' }
}

export async function lookupPincode(pincode: string): Promise<{ city: string; state: string } | null> {
  const auth = await requireUser()
  if (!auth.ok || !PINCODE_SHAPE.test(String(pincode ?? ''))) return null
  return placeForPincode(pincode)
}

const Shop = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z.string(),
  pickup: z.string().regex(PINCODE_SHAPE),
  sells: z.array(z.enum(SELLS)).max(SELLS.length),
})

const SENTENCES: Record<string, string> = {
  email_unconfirmed: 'Confirm your email first: use the link or code we sent.',
  has_shop: 'You already have a shop. Opening it now.',
  bad_name: 'Your shop needs a name of up to 60 letters.',
  bad_slug: 'That address cannot be used. Letters, digits and hyphens, at least 3.',
  bad_pincode: 'A pincode is 6 digits and starts with 1 to 9.',
  slug_taken: 'Someone just took that address. Try another.',
}

export async function createMyShop(input: unknown): Promise<{ ok: true } | { ok: false; error: string; field?: 'name' | 'slug' | 'pickup'; hasShop?: boolean }> {
  const auth = await requireUser()
  if (!auth.ok) return { ok: false, error: auth.message }
  const parsed = Shop.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields.' }
  const { name, slug, pickup, sells } = parsed.data
  if (slugProblem(slug)) return { ok: false, field: 'slug', error: SENTENCES.bad_slug! }
  if (!(await withinLimit(LIMITS.createShopIp, await clientIp()))) return { ok: false, error: 'Too many shops made from here in the last hour. Try again later.' }
  const r = await createShop({ uid: auth.userId, name, slug, pickup, sells })
  if (r.ok) return { ok: true }
  const field = r.error === 'slug_taken' || r.error === 'bad_slug' ? 'slug' : r.error === 'bad_name' ? 'name' : r.error === 'bad_pincode' ? 'pickup' : undefined
  return { ok: false, field, hasShop: r.error === 'has_shop', error: SENTENCES[r.error] ?? 'We could not create your shop. Nothing was saved. Try again in a minute.' }
}
