// =============================================================================
// FILE: src/lib/auth/fetch-site.ts — WHICH SHOP REQUESTS A BROWSER SAYS CAME FROM ANOTHER SITE (one-address plan
// P4a·2, spec § 6). Store hosts are siblings under frrata.shop: until the Public Suffix List carries it (P4b), store
// Y's page is "same-site" with store X, so SameSite=Lax cookies ride along on Y's requests to X. Sec-Fetch-Site tells
// them apart: X's own pages send `same-origin`; Y's send `same-site`.
//
// The rule, for every request requireShop answers (all of /api/shop: each is personal or changes state): refused
// when the header is present and not `same-origin`. Absent passes (iOS before 16.4 sends none; require-ek.ts has the
// same rule). Exemptions are named below with their reason. The secure host's requireSecure (P3) calls the same
// fetchSiteVerdict, with its own exemptions.
//
// Pure (no server-only, no I/O): requireShop logs or refuses on its verdict.
// =============================================================================

/**
 * 'log': a request that would be refused is logged and answered as before. 'enforce': it is refused (403).
 * Shipped 'log' on 2026-11-16; the orchestrator flips it after a week of logs shows no own-page request refused.
 */
export const FETCH_SITE_MODE: 'log' | 'enforce' = 'log'

/** Requests answered whatever Sec-Fetch-Site says, each with why. Exact method and path. */
export const FETCH_SITE_EXEMPT: readonly { method: string; path: string; why: string }[] = [
  { method: 'GET', path: '/api/shop/ekcode/return', why: "EkCode's return is a navigation from ekcode.in. It is cross-site by design. Its state cookie and PKCE check it." },
  { method: 'POST', path: '/api/shop/e', why: 'The visit beacon carries nothing personal. It changes nothing of the shopper. Its ingest checks Origin first.' },
]

/** Sec-Fetch-Site values a refusal names; anything a browser never sends is 'other' (a fixed set, so logs stay bounded). */
export type ForeignSite = 'same-site' | 'cross-site' | 'none' | 'other'
export type FetchSiteVerdict =
  | { refuse: false; why: 'absent' | 'same-origin' | 'exempt' }
  | { refuse: true; site: ForeignSite }

export function fetchSiteVerdict(site: string | null, method: string, path: string): FetchSiteVerdict {
  if (FETCH_SITE_EXEMPT.some((e) => e.method === method.toUpperCase() && e.path === path)) return { refuse: false, why: 'exempt' }
  if (site === null || site === '') return { refuse: false, why: 'absent' }
  const s = site.trim().toLowerCase()
  if (s === 'same-origin') return { refuse: false, why: 'same-origin' }
  // same-site (a sibling store), cross-site, none (typed or bookmarked: no shop page links an API path that way),
  // and anything unknown.
  return { refuse: true, site: s === 'same-site' || s === 'cross-site' || s === 'none' ? s : 'other' }
}

/** Sec-Fetch-Mode for the log line, from a fixed set. */
export const fetchMode = (m: string | null): string =>
  ['navigate', 'cors', 'no-cors', 'same-origin', 'websocket'].includes((m ?? '').toLowerCase()) ? (m ?? '').toLowerCase() : m ? 'other' : ''

/** The path for the log line: a route-shaped /api/shop path, else 'other' (a token or junk never reaches a log). */
export const logPath = (p: string): string => (/^\/api\/shop(\/[a-z-]{1,20}){1,3}$/.test(p) ? p : 'other')

/** What requireShop does with a verdict: answer as before, log (naming the site) and answer, or refuse. */
export function fetchSiteAction(v: FetchSiteVerdict, mode: 'log' | 'enforce'): { act: 'pass' } | { act: 'log'; site: ForeignSite } | { act: 'refuse' } {
  if (!v.refuse) return { act: 'pass' }
  return mode === 'enforce' ? { act: 'refuse' } : { act: 'log', site: v.site }
}

/**
 * One log line per (site, method, path) a minute per instance, so a page hammering a store cannot flood the logs.
 * Holds at most 200 keys. Returns whether to log now.
 */
const seen = new Map<string, number>()
export function logOnce(key: string, now: number): boolean {
  const at = seen.get(key)
  if (at !== undefined && now - at < 60_000) return false
  if (seen.size >= 200) seen.delete(seen.keys().next().value!)
  seen.delete(key)
  seen.set(key, now)
  return true
}
