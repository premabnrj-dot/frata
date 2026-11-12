import 'server-only'
import { createHash } from 'node:crypto'
import { passkeyCookieName, passkeyCookieSecure } from './webauthn'

// =============================================================================
// FILE: src/lib/auth/staff-cookie.ts — the staff passkey step-up's cookie and the passkey's site
// (docs/specs/2026-11-12-staff-passkeys.md). `__Host-` and Secure everywhere except the local e2e stack, which serves
// the console over plain http on localhost (a secure context to WebAuthn; Chromium drops a Secure cookie there).
// The cookie holds a random token; the database keeps only its SHA-256.
// =============================================================================

// The site check and the cookie rules are the passkey module's (src/lib/auth/webauthn.ts), shared with partner people.
export const staffCookieName = () => passkeyCookieName('frrata_staff')
export const staffCookieSecure = passkeyCookieSecure
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
export { passkeySite, type PasskeySite } from './webauthn'
