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

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

/** The customizer's look preview only: the console may frame it (themes spec § Preview). Same policy otherwise. */
export const FRAMEABLE_HEADERS: { key: string; value: string }[] = SECURITY_HEADERS.map((h) =>
  h.key === 'X-Frame-Options' ? { key: h.key, value: 'SAMEORIGIN' }
    : h.key === 'Content-Security-Policy' ? { key: h.key, value: CONTENT_SECURITY_POLICY.replace("frame-ancestors 'none'", "frame-ancestors 'self'") } : h)
