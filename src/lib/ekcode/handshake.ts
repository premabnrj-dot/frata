import 'server-only'
import { cookies } from 'next/headers'
import { EKCODE_HOST } from '@/lib/public-env'
import { startFlow } from '@/lib/db/ekcode'
import { randomToken, s256, sameToken, tokenDigest } from './keys'
import { cookieName, cookieSecure, scheme } from './cookie-name'

// =============================================================================
// FILE: src/lib/ekcode/handshake.ts — THE SHOP'S HALF OF THE HANDSHAKE (P1 task 7; tenancy B1, security H3). The shop's
// server makes the flow (tenant and host from its own request), keeps `state.verifier` in its own cookie for 10
// minutes, and sends the shopper to ekcode.in with only a random handle. On return it checks state (timing-safe),
// clears the cookie, and hands the verifier's S256 to the redeem.
// =============================================================================

const STATE = () => cookieName('ek_state')
export const SESSION = () => cookieName('shop_s')
/** A non-HttpOnly hint that a session exists, so the checkout asks /me only when there is something to read. */
export const HINT = 'shop_in'

export async function beginAtShop(tenantId: string, host: string): Promise<string | null> {
  const handle = randomToken(), state = randomToken(), verifier = randomToken()
  if (!(await startFlow(tenantId, host, tokenDigest(handle), state, s256(verifier), 'shown'))) return null
  ;(await cookies()).set(STATE(), `${state}.${verifier}`, { httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/', maxAge: 600 })
  return `${scheme()}://${EKCODE_HOST}/api/ek/begin?flow=${handle}`
}

/** The verifier's S256 when `state` matches this shop's cookie; the cookie is cleared either way. */
export async function finishAtShop(state: string): Promise<string | null> {
  const jar = await cookies()
  const raw = jar.get(STATE())?.value ?? ''
  jar.set(STATE(), '', { httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/', maxAge: 0 })
  const [s, v] = raw.split('.')
  if (!s || !v || !sameToken(s, state)) return null
  return s256(v)
}

export async function setSession(token: string) {
  const jar = await cookies()
  jar.set(SESSION(), token, { httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/', maxAge: 30 * 86_400 })
  jar.set(HINT, '1', { httpOnly: false, secure: cookieSecure(), sameSite: 'lax', path: '/', maxAge: 30 * 86_400 })
}
export async function sessionToken(): Promise<string | null> { return (await cookies()).get(SESSION())?.value ?? null }
export async function clearSession() {
  const jar = await cookies()
  jar.set(SESSION(), '', { httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/', maxAge: 0 })
  jar.set(HINT, '', { httpOnly: false, secure: cookieSecure(), sameSite: 'lax', path: '/', maxAge: 0 })
}
