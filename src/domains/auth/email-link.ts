// =============================================================================
// FILE: src/domains/auth/email-link.ts — which sign-in emails Frrata sends and /auth/confirm accepts, once, for both
// (impact review: two copies drifted). No `email_change`: Frrata never changes an address, and a change email that read
// as a sign-in could hand someone else's address to an attacker's account (security review M2, 2026-11-15).
// =============================================================================

export const EMAIL_LINK_TYPES = ['magiclink', 'signup', 'email', 'invite'] as const
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number]
export const isEmailLinkType = (v: unknown): v is EmailLinkType => (EMAIL_LINK_TYPES as readonly unknown[]).includes(v)

/** The sign-in email's button: our own /auth/confirm on the console host (never a host from the payload), which signs in
 *  only when the person presses Sign in. Plain http on a local run. */
export function signInLink(consoleHost: string, tokenHash: string, type: EmailLinkType): string {
  const scheme = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(consoleHost) ? 'http' : 'https'
  return `${scheme}://${consoleHost}/auth/confirm?${new URLSearchParams({ token_hash: tokenHash, type })}`
}
