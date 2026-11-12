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

/** The passkey's site: the console host without a port (WebAuthn's relying-party id) and its exact origin. */
export const passkeySite = (): { rpID: string; origin: string } | null => {
  if (!CONSOLE_HOST) return null
  return { rpID: CONSOLE_HOST.replace(/:\d+$/, ''), origin: `${insecure() ? 'http' : 'https'}://${CONSOLE_HOST}` }
}
