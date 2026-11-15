// =============================================================================
// FILE: src/domains/settings/instagram.ts — A SHOP'S INSTAGRAM HANDLE, read one way (V1 Storefront API, impact review
// 2026-11-15): Settings stores what the owner typed (`@kesar.studio`, `kesar.studio`, or a profile link). The shop's
// links and the Storefront API both read it here, so they never show different handles. Pure.
// =============================================================================

/** The handle (letters, digits, `.` and `_`, ≤ 30), or null when what was typed isn't one. */
export function instagramHandle(stored: string | null | undefined): string | null {
  const h = (stored ?? '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/$/, '')
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : null
}

/** `https://instagram.com/<handle>`, or null. */
export const instagramLink = (stored: string | null | undefined): string | null => {
  const h = instagramHandle(stored)
  return h ? `https://instagram.com/${h}` : null
}
