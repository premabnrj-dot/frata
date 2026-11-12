import 'server-only'
import { createHash } from 'node:crypto'
import { E2E_FIXTURES, VERCEL_ENV } from '@/lib/env'
import { CONSOLE_HOST } from '@/lib/public-env'

// =============================================================================
// FILE: src/lib/auth/staff-cookie.ts — the staff passkey step-up's cookie and the passkey's site
// (docs/specs/2026-11-12-staff-passkeys.md). `__Host-` and Secure everywhere except the local e2e stack, which serves
// the console over plain http on localhost (a secure context to WebAuthn; Chromium drops a Secure cookie there).
// The cookie holds a random token; the database keeps only its SHA-256.
// =============================================================================

const insecure = () => VERCEL_ENV === '' && (E2E_FIXTURES || process.env.NODE_ENV === 'development')
export const staffCookieName = () => (insecure() ? 'frrata_staff' : '__Host-frrata_staff')
export const staffCookieSecure = () => !insecure()
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export type PasskeySite = { rpID: string; origin: string }
/** The passkey's site for a request to `requestHost`: only the console host (compared without a port), its
 *  relying-party id that host name, its expected origin that scheme and host exactly. Null anywhere else. */
export const passkeySite = (requestHost: string): PasskeySite | null => {
  const rpID = CONSOLE_HOST.toLowerCase().replace(/:\d+$/, '')
  const host = requestHost.toLowerCase()
  if (!rpID || host.replace(/:\d+$/, '') !== rpID || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return null
  return { rpID, origin: `${insecure() ? 'http' : 'https'}://${host}` }
}
