import 'server-only'
import { passkeyCookieName, passkeyCookieSecure } from './webauthn'

// =============================================================================
// FILE: src/lib/auth/partner-cookie.ts — the partner person's passkey step-up cookie (T1b): `__Host-frrata_partner`
// (plain `frrata_partner` on the local e2e stack), a random token whose SHA-256 alone is stored (partner_stepups).
// The same rules as the staff cookie (src/lib/auth/staff-cookie.ts); a different name, so neither stands for the other.
// =============================================================================

export const partnerCookieName = () => passkeyCookieName('frrata_partner')
export const partnerCookieSecure = passkeyCookieSecure
/** Set on a passed check: 12 hours, the database's own expiry for the step-up. Cleared with the same flags. */
export const partnerCookieOptions = (maxAge = 12 * 3600) => ({ httpOnly: true, secure: partnerCookieSecure(), sameSite: 'strict' as const, path: '/', maxAge })
