// =============================================================================
// FILE: src/domains/storefront-api/preview.ts — THE PREVIEW TOKEN'S SHAPE (ADR-0018 § 12; SA1b plan D·4). Pure.
//
// A hidden page or the FAQ's draft opens on the brand's website only with a token Frrata signed in the console: bound
// to the store and the key (inside the MAC, never in clear), to one entry and to ten minutes at most. It rides in a
// request header (`Frrata-Preview`), never the URL, so it never reaches a request log. The signer and the verifier are
// src/lib/storefront-api/preview-token.ts.
// =============================================================================

export const PREVIEW_HEADER = 'frrata-preview'
export const PREVIEW_SECONDS = 600
/** One entry a token opens: a page by its handle, or the FAQ. */
export type PreviewEntry = 'faq' | `page:${string}`
export const PREVIEW_ENTRY = /^(?:faq|page:[a-z0-9]+(?:-[a-z0-9]+)*)$/
const ENTRY_MAX = 65
/** `v1.<payload>.<mac>`, base64url both; the payload is `{"e":…,"x":…}` (≤ 120 characters), the MAC sha256 (43). */
export const TOKEN_SHAPE = /^v1\.[A-Za-z0-9_-]{8,120}\.[A-Za-z0-9_-]{43}$/

export const previewEntry = (resource: 'page' | 'faq', handle?: string): PreviewEntry | null => {
  const e = resource === 'faq' ? 'faq' : `page:${handle ?? ''}`
  return e.length <= ENTRY_MAX && PREVIEW_ENTRY.test(e) ? (e as PreviewEntry) : null
}

/** A payload read back after its MAC checked: exactly `e` and `x`, the entry asked for, unexpired, ≤ 10 minutes ahead. */
export function payloadOk(raw: unknown, entry: PreviewEntry, nowS: number): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const keys = Object.keys(raw)
  if (keys.length !== 2 || !keys.includes('e') || !keys.includes('x')) return false
  const { e, x } = raw as { e: unknown; x: unknown }
  return e === entry && typeof x === 'number' && Number.isInteger(x) && x > nowS && x <= nowS + PREVIEW_SECONDS
}
