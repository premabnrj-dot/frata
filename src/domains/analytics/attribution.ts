// =============================================================================
// FILE: src/domains/analytics/attribution.ts
//
// HOW A SHOPPER ARRIVED, as the order keeps it (Analytics A·1; plan review 7–8; frata-integrations § Attribution
// signals, checked 2026-11-08). ONE list of keys and ONE cleaner, used by the shop's capture island, the orders route
// and the abandoned-order erase, so the three never drift (they had: the bag store lacked keys the route took).
// Raw values are kept as typed (owner, 8 Nov: kept with the order); classification happens on read (source.ts).
// Pure: no I/O.
// =============================================================================

/** The landing parameters and the referring site we keep. `fbc`/`fbp` are cookie values Meta never puts in a URL, and
 * `igsh` is only on instagram.com links: neither is a key (integration-researcher, 2026-11-08). */
export const ATTRIBUTION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'gclid', 'gbraid', 'wbraid', 'gad_source', 'srsltid', 'ref_host',
] as const
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number]
export type Attribution = Partial<Record<AttributionKey, string>>

/** Erased with an abandoned order's other details (DPDP, `erase.ts`): every key but the merchant's own utm tags (so a
 * click id added to the list later is erased too), and `fbc`/`fbp`, stored before this list existed. */
export const ERASED_KEYS: readonly string[] = [...ATTRIBUTION_KEYS.filter((k) => !k.startsWith('utm_')), 'fbc', 'fbp']

const MAX = 200
const isKey = (k: string): k is AttributionKey => (ATTRIBUTION_KEYS as readonly string[]).includes(k)

/** A value as a shopper's URL carried it, made safe to keep and show: NFKC, no control or bidi characters, trimmed, ≤ 200. */
export function cleanValue(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, MAX)
  return s ? s : null
}

/** Where a payment page sends the shopper back from: never a source. */
const PAYMENT_HOSTS = ['razorpay.com', 'api.razorpay.com', 'checkout.razorpay.com', 'pages.razorpay.com']

export type HostRules = {
  /** This shop's own hosts (its address on the shop domain and its custom domains), from the server's tenant. */
  ownHosts: readonly string[]
  /** The platform's shop domain (every shop's `*.SHOP_DOMAIN` is ours, never a source). */
  shopDomain: string
  /** The console's host (a preview or a merchant's own visit is never a source). */
  consoleHost?: string | null
}

/**
 * The referring site, as a bare hostname, or null when it is not a source. Accepts a hostname or a URL (a client that
 * sent the whole referrer); only http(s) and android-app (an Android app's package) count; never an IP address,
 * localhost, our own hosts, any shop on the shop domain, the console, or a payment page.
 */
export function reduceHost(raw: unknown, rules: HostRules): string | null {
  const v = cleanValue(raw)
  if (!v) return null
  let host: string
  if (v.includes('://')) {
    let u: URL
    try { u = new URL(v) } catch { return null }
    if (u.protocol === 'android-app:') host = (u.hostname || u.pathname.replace(/^\/\//, '').split('/')[0] || '').toLowerCase()
    else if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname.toLowerCase()
    else return null
  } else {
    host = v.toLowerCase()
  }
  host = host.replace(/\.$/, '')
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || !host.includes('.')) return null
  if (/^\d+(\.\d+){3}$/.test(host) || host === 'localhost' || host.endsWith('.localhost')) return null
  const shop = rules.shopDomain.toLowerCase()
  if (host === shop || host.endsWith('.' + shop)) return null
  if (rules.ownHosts.some((h) => h.toLowerCase() === host)) return null
  if (rules.consoleHost && host === rules.consoleHost.toLowerCase()) return null
  if (PAYMENT_HOSTS.includes(host)) return null
  return host
}

/** What a request or the bag store carried, kept to the listed keys, each cleaned; `ref_host` reduced by `rules`. */
export function cleanAttribution(raw: unknown, rules: HostRules): Attribution {
  const out: Attribution = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isKey(k)) continue
    const clean = k === 'ref_host' ? reduceHost(v, rules) : cleanValue(v)
    if (clean) out[k] = clean
  }
  return out
}

/** An order's stored attribution (`orders.checkout`, which may be null or `{}`), read back to the listed keys. */
export function attributionOf(checkout: unknown): Attribution {
  const a = checkout && typeof checkout === 'object' ? (checkout as { attribution?: unknown }).attribution : null
  const out: Attribution = {}
  if (!a || typeof a !== 'object' || Array.isArray(a)) return out
  // Cleaned on read too: rows stored before the cleaner existed may carry control or bidi characters.
  for (const [k, v] of Object.entries(a as Record<string, unknown>)) { if (!isKey(k)) continue; const c = cleanValue(v); if (c) out[k] = c }
  return out
}

/** The query parameters of a landing URL that we keep (the island reads `location.search` with this). */
export function landingParams(search: string): Attribution {
  const p = new URLSearchParams(search)
  const out: Attribution = {}
  for (const k of ATTRIBUTION_KEYS) {
    if (k === 'ref_host') continue
    const v = cleanValue(p.get(k))
    if (v) out[k] = v
  }
  return out
}

/** Whether a landing carries a source of its own (a tagged link or a click id): such a landing replaces the last one. */
export const isTagged = (a: Attribution) => ATTRIBUTION_KEYS.some((k) => k !== 'ref_host' && !!a[k])
