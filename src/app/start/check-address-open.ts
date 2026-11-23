'use server'

import { slugProblem } from '@/domains/signup/slug'
import type { AddressCheck } from '@/domains/signup/steps'
import { slugAvailable } from '@/lib/db/platform'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp, netBucket } from '@/lib/http/client-ip'
import { errName } from '@/lib/log'

// ENTRY POINT (scripts/check-actions.mjs, exactly this one export): sign-up asks whether an address is free BEFORE the
// person signs in (plan 2026-11-23-o1-signup O1·7). It reads no tenant and answers one word. Limited per network (IPv6
// by /64), per site (IPv6 /48) and across Frrata (LIMITS.addressOpenAll), every bucket failing closed: over a limit or
// on a database error it answers `limited`, which shows nothing and lets the person go on — never a false "taken".
// Creation checks the address again (app_create_shop_v3's slug_taken).
export async function checkAddressOpen(slug: unknown): Promise<AddressCheck> {
  if (typeof slug !== 'string' || slug.length > 30) return { state: 'shape' }
  const s = slug.toLowerCase()
  const problem = slugProblem(s)
  if (problem) return { state: problem }
  const now = new Date() // clock-ok: a server action, never rendered
  const ip = await clientIp()
  if (!(await withinLimit(LIMITS.addressOpenIp, ip, now, true))) return { state: 'limited' }
  if (!(await withinLimit(LIMITS.addressOpenNet, netBucket(ip), now, true))) return { state: 'limited' }
  if (!(await withinLimit(LIMITS.addressOpenAll, 'all', now, true))) return { state: 'limited' }
  try {
    return (await slugAvailable(s)) ? { state: 'ok' } : { state: 'taken' }
  } catch (err) {
    console.error('[checkAddressOpen]', errName(err))
    return { state: 'limited' }
  }
}
