import 'server-only'
import { passkeyCookieName, passkeyCookieSecure } from './webauthn'
import { CHECK_MS } from '@/domains/partners/passkeys'

// =============================================================================
// FILE: src/lib/auth/partner-cookie.ts — the partner person's passkey step-up cookie (T1b): `__Host-frrata_partner`
// (plain `frrata_partner` on the local e2e stack), a random token whose SHA-256 alone is stored (partner_stepups).
// The same rules as the staff cookie (src/lib/auth/staff-cookie.ts); a different name, so neither stands for the other.
// =============================================================================

export const partnerCookieName = () => passkeyCookieName('frrata_partner')
/** Set on a passed check: 12 hours, the database's own expiry for the step-up. Cleared with the same flags. */
export const partnerCookieOptions = (maxAge = CHECK_MS / 1000) => ({ httpOnly: true, secure: passkeyCookieSecure(), sameSite: 'strict' as const, path: '/', maxAge })
