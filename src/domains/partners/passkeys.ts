// =============================================================================
// FILE: src/domains/partners/passkeys.ts — the pure rules of partner sign-in (T1b; docs/specs/2026-11-15-partner-login.md,
// mockup https://claude.ai/artifact/Cway5SSahPgQeuCo2UmdTJ). No I/O: read by the route, the pages and the tests.
// =============================================================================

/** A workspace write that needs a passkey check in the last 5 minutes said this; the browser confirms and tries again. */
export const CONFIRM_AGAIN = 'Confirm it’s you again.'
/** The check every workspace step needs; the database refuses without it (app_partner_need). */
export const CONFIRM_FIRST = 'Confirm it’s you first.'
/** A check lasts 12 hours on a browser session; the workspace warns 10 minutes before it ends (mockup screen 15). */
export const CHECK_MS = 12 * 3600_000
export const WARN_BEFORE_MS = 10 * 60_000

/** "Chrome on Android": the approver's context (mockup screen 10), never the raw user agent. Null when unknown. */
export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null
  const os = /Android/.test(ua) ? 'Android' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser\//.test(ua) ? 'Samsung Internet' : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  if (!os && !browser) return null
  return browser && os ? `${browser} on ${os}` : (browser ?? os)
}

/** Vercel's `x-vercel-ip-city` is URL-encoded ("New%20Delhi"). Letters, spaces, dots and hyphens only; else null. */
export function cityLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  let v: string
  try { v = decodeURIComponent(raw) } catch { return null }
  v = v.trim()
  return /^[\p{L}][\p{L} .'-]{0,59}$/u.test(v) ? v : null
}

/** Where "Sign in again" returns to: a workspace page only (never the sign-in page itself), else Clients. */
export function partnerReturnPath(path: string | null | undefined): string {
  if (!path || !/^\/partner(\/[a-z0-9-]+){0,3}$/.test(path) || path.startsWith('/partner/sign-in')) return '/partner'
  return path
}

/** The workspace page's name for "Back to Clients › Kesar Studio" (mockup screen 16). */
export function returnLabel(path: string): string {
  const p = partnerReturnPath(path)
  const name = { '/partner': 'Clients', '/partner/team': 'Team', '/partner/details': 'Your details', '/partner/new': 'New client store', '/partner/passkeys': 'Passkeys' }[p]
  return name ?? 'Clients'
}

/** "p•••@pixelthread.in" (mockup screen 2): the first letter and the domain. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return email
  return `${email[0]}•••${email.slice(at)}`
}

/** The 12-hour check's warning (mockup screen 15): due within 10 minutes and not yet ended. */
export function checkEndsSoon(confirmedAt: Date, now: Date): boolean {
  const left = confirmedAt.getTime() + CHECK_MS - now.getTime()
  return left > 0 && left <= WARN_BEFORE_MS
}
