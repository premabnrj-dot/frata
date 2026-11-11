'use server'

import { z } from 'zod'
import { SELLS } from '@/lib/db/schema'
import { startingHsn } from '@/domains/catalogue/sell-keys'
import { setStartingHsn } from '@/lib/queries/settings'
import { errName } from '@/lib/log'
import { PINCODE_SHAPE, slugProblem } from '@/domains/signup/slug'
import { requireUser } from '@/lib/auth/require-user'
import { hostFor, refreshHosts } from '@/lib/queries/storefront'
import { createShop, placeForPincode, slugAvailable } from '@/lib/db/platform'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp } from '@/lib/http/client-ip'
import { PLAN_CODES } from '@/domains/plans/entitlements'
import { claimKey } from '@/lib/trials/claims'
import { cleanMobile } from '@/domains/checkout/mobile'
import { checkCode, sendCode, signupCodeOn } from '@/lib/trials/signup-code'

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
  plan: z.enum(PLAN_CODES).default('growth'),
  codeId: z.uuid().nullable().default(null),
})

const SENTENCES: Record<string, string> = {
  email_unconfirmed: 'Confirm your email first: use the link or code we sent.',
  has_shop: 'You already have a shop. Opening it now.',
  bad_name: 'Your shop needs a name of up to 60 letters.',
  bad_slug: 'That address cannot be used. Letters, digits and hyphens, at least 3.',
  bad_pincode: 'A pincode is 6 digits and starts with 1 to 9.',
  bad_plan: 'Choose a plan.',
  bad_code: 'That WhatsApp code has expired. Ask for a new one.',
  slug_taken: 'Someone just took that address. Try another.',
}

export async function createMyShop(input: unknown): Promise<{ ok: true; trial: boolean } | { ok: false; error: string; field?: 'name' | 'slug' | 'pickup' | 'phone'; hasShop?: boolean }> {
  const auth = await requireUser()
  if (!auth.ok) return { ok: false, error: auth.message }
  const parsed = Shop.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields.' }
  const { name, slug, pickup, sells, plan, codeId } = parsed.data
  // Q4: with the WhatsApp code on, a verified code is required (its phone is claimed inside the definer, R3).
  if (signupCodeOn() && !codeId) return { ok: false, error: 'Verify your WhatsApp number first.' }
  if (slugProblem(slug)) return { ok: false, field: 'slug', error: SENTENCES.bad_slug! }
  if (!(await withinLimit(LIMITS.createShopIp, await clientIp()))) return { ok: false, error: 'Too many shops made from here in the last hour. Try again later.' }
  // The email key is the VERIFIED email from getUser() (requireUser), never a form value (trials T1).
  const r = await createShop({ uid: auth.userId, name, slug, pickup, sells, plan, email: claimKey('email', auth.email), codeId: signupCodeOn() ? codeId : null })
  // Misses are not cached, but a lookup made in the same minute is: clear it for the new address.
  if (r.ok) {
    // A new product's starting HSN, from what the shop sells (plan 2026-11-09-gst-core-and-categories § 2): a prefill,
    // never a fallback. Best effort: the shop exists either way, and Settings › Taxes shows and changes it.
    await setStartingHsn(r.tenantId, startingHsn(sells)).catch((e) => console.error('[createMyShop] starting hsn', errName(e)))
    refreshHosts(hostFor(slug)); return { ok: true, trial: r.trial }
  }
  const field = r.error === 'slug_taken' || r.error === 'bad_slug' ? 'slug' : r.error === 'bad_name' ? 'name' : r.error === 'bad_pincode' ? 'pickup' : r.error === 'bad_code' ? 'phone' : undefined
  return { ok: false, field, hasShop: r.error === 'has_shop', error: SENTENCES[r.error] ?? 'We could not create your shop. Nothing was saved. Try again in a minute.' }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// ── Trials TR1: the WhatsApp code (on only when Frrata's own number is set up; R2: rate-limited, fail closed). ──
export async function sendSignupCode(phone: string): Promise<{ ok: true; codeId: string } | { ok: false; error: string }> {
  const auth = await requireUser()
  if (!auth.ok) return { ok: false, error: auth.message }
  if (!signupCodeOn()) return { ok: false, error: 'Not available yet.' }
  const mobile = typeof phone === 'string' && phone.length <= 20 ? cleanMobile(phone) : null
  if (!mobile) return { ok: false, error: 'A 10-digit Indian mobile number.' }
  const phoneKey = claimKey('phone', mobile)!.hmac
  const ip = await clientIp()
  const now = new Date()
  const allowed = await withinLimit(LIMITS.signupCodeUser, auth.userId, now, true) && await withinLimit(LIMITS.signupCodePhone, phoneKey, now, true)
    && await withinLimit(LIMITS.signupCodePhoneDay, phoneKey, now, true) && await withinLimit(LIMITS.signupCodeUserDay, auth.userId, now, true)
    && await withinLimit(LIMITS.signupCodeIp, ip, now, true) && await withinLimit(LIMITS.signupCodeAll, 'all', now, true)
  if (!allowed) return { ok: false, error: 'Too many codes. Try again in an hour.' }
  const codeId = await sendCode(auth.userId, mobile)
  return codeId ? { ok: true, codeId } : { ok: false, error: 'We could not send the code. Check the number is on WhatsApp.' }
}

export async function verifySignupCode(codeId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser()
  if (!auth.ok) return { ok: false, error: auth.message }
  if (!UUID.test(String(codeId ?? ''))) return { ok: false, error: 'Ask for a new code.' }
  return (await checkCode(auth.userId, codeId, String(code ?? '').slice(0, 8).trim())) ? { ok: true } : { ok: false, error: 'That code is not right, or has expired.' }
}
