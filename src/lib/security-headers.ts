// =============================================================================
// FILE: src/lib/security-headers.ts (from Ekatan)
//
// THE HEADERS EVERY RESPONSE CARRIES — read by next.config.ts.
//
// ⚠️ NO script-src, DELIBERATELY. Next's inline bootstrap scripts need a
// per-request nonce, and a nonce makes every page dynamic; storefront pages
// must stay cacheable for festive peaks. Never "finish" the policy with
// 'unsafe-inline': it protects nothing.
//
// payment=() is NOT set: Razorpay Checkout and UPI intents need the Payment
// Request API on storefronts.
// =============================================================================

export const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

/**
 * HSTS (shop addresses D2·1): `includeSubDomains` only on hosts that are ours — the console host and every
 * `*.SHOP_DOMAIN`. Any other host is a merchant's own domain, where it would force HTTPS on subdomains we don't serve
 * (their blog, their mail webmail): there, one year without it. next.config.ts sends the default everywhere and the
 * platform value on our hosts (a later matching entry replaces a header of the same name).
 */
export const HSTS_OWN_DOMAIN = { key: 'Strict-Transport-Security', value: 'max-age=31536000' }
export const HSTS_PLATFORM = { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }
/** A literal host as a `has: host` value (Next turns the value into an anchored regex: dots must be escaped). */
export const hostValue = (s: string) => s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Next's `has: host` value: a regex anchored by Next, matched against the lowercased host without its port. */
export function platformHostPattern(consoleHost: string, shopDomain: string, ekcodeHost = ''): string {
  const ek = ekcodeHost ? `|(?:www\\.)?${hostValue(ekcodeHost)}` : ''
  return `(?:${hostValue(consoleHost)}|(?:[a-z0-9-]+\\.)?${hostValue(shopDomain)}${ek})`
}

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Passkeys (staff passkeys spec, 2026-11-12): no page may ask for one — merchant content framed on the console
  // host (the look preview) included — except Admin's own pages on the console host (ADMIN_PASSKEY_HEADERS).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=(), publickey-credentials-get=(), publickey-credentials-create=()' },
  HSTS_OWN_DOMAIN,
]

/** Admin's pages on the console host: the same policy, with passkeys allowed for this origin only. */
export const ADMIN_PASSKEY_HEADERS: { key: string; value: string }[] = [
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=(), publickey-credentials-get=(self), publickey-credentials-create=(self)' },
]

/** The customizer's look preview only: the console may frame it (themes spec § Preview). Same policy otherwise. */
export const FRAMEABLE_HEADERS: { key: string; value: string }[] = SECURITY_HEADERS.map((h) =>
  h.key === 'X-Frame-Options' ? { key: h.key, value: 'SAMEORIGIN' }
    : h.key === 'Content-Security-Policy' ? { key: h.key, value: CONTENT_SECURITY_POLICY.replace("frame-ancestors 'none'", "frame-ancestors 'self'") } : h)

/**
 * THE SCRIPT POLICY for the signed-in pages on the console host (security review S3, 2026-11-08), sent by the
 * middleware beside the global policy above (it carries the global policy too: a middleware header replaces next.config's). Those pages render per
 * request already, so a per-request nonce costs no cache; Next reads it from the request's CSP header and puts it on
 * its own scripts. 'strict-dynamic' lets a nonced script load the next one (the Meta SDK in Connect). Shops and the
 * static public pages keep the global policy only: a nonce would make them per-request.
 */
export function signedInCsp(nonce: string, dev: boolean, framed = false): string {
  // The whole policy: a middleware header REPLACES next.config's header of the same name, it does not add a second.
  return [
    (framed ? CONTENT_SECURITY_POLICY.replace("frame-ancestors 'none'", "frame-ancestors 'self'") : CONTENT_SECURITY_POLICY),
    `script-src 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "form-action 'self'",
  ].join('; ')
}

/** The console-host paths that render per request behind a sign-in (or lead to one). `/partners` is the public page, not `/partner`. */
/**
 * EkCode's /continue (security review M2): scripts by nonce only, calls to its own host only, the proof-of-work worker
 * from a blob, nothing framed, forms only to itself, no referrer leaves.
 */
export function ekcodeCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ')
}

const SIGNED_IN = ['/console', '/admin', '/partner', '/choose', '/handover', '/login', '/start', '/auth']
export function isSignedInPath(path: string): boolean {
  return SIGNED_IN.some((p) => path === p || path.startsWith(`${p}/`))
}

/**
 * The Supabase session cookies (security review S2): never readable by a page script (nothing reads the session in
 * the browser), only over HTTPS outside development, and kept 30 days, not @supabase/ssr's 400.
 */
export const SESSION_COOKIE = { httpOnly: true, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 30, path: '/' }
export function sessionCookieOptions(dev = process.env.NODE_ENV === 'development') {
  return { ...SESSION_COOKIE, secure: !dev }
}
