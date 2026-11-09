import { parse } from 'tldts'
import { tidyDomain } from './domain-input'

// =============================================================================
// FILE: src/domains/addresses/domains.ts — CAN THIS DOMAIN BE CONNECTED (shop addresses D2·3).
// Pure. Server-side only by convention: tldts carries the Public Suffix List (~100 kB), so the browser gets
// domain-input.ts instead. Blocked domains (Admin › Names) are a database fact the caller checks after this.
// =============================================================================

export const MAX_HOSTS_A_SHOP = 4

export type DomainProblem =
  | 'shape' // not a host name at all (spaces, a port, @, _, *, a label over 63, too long)
  | 'not_ascii' // non-Latin or punycode (look-alikes)
  | 'ip' // an IP address
  | 'suffix' // a bare public suffix (co.in, vercel.app)
  | 'reserved' // a Frrata host, the console's, a hosting platform's, or a local/test name
  | 'tld' // the last label is not a real top-level domain (all digits, unknown)

export type DomainFacts = {
  /** The host we connect: the apex when they typed www.<apex>, else what they typed. */
  host: string
  /** The registrable domain (kesarstudio.in for shop.kesarstudio.in). */
  apex: string
  /** The host also connected, sent to `host`: www.<apex> when `host` is the apex. */
  www: string | null
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const LOCAL = /(^|\.)(local|localhost|internal|test|example|invalid|onion|home|lan|corp)$/
/** Hosts and platforms no shop may claim (their own subdomains included). */
const OURS = ['frrata.shop', 'frrata.com', 'frrata.in', 'frata.in', 'frata.store', 'frata.test', 'frratamail.com', 'vercel.app', 'vercel.com', 'vercel-dns.com', 'now.sh']

const under = (host: string, d: string) => host === d || host.endsWith(`.${d}`)

/** Why `raw` can't be connected, or its facts. `consoleHost` and `shopDomain` are refused with their subdomains. */
export function checkDomain(raw: string, opts: { consoleHost: string; shopDomain: string }): { ok: true; facts: DomainFacts } | { ok: false; problem: DomainProblem } {
  if (raw.length > 300) return { ok: false, problem: 'shape' }
  const host = tidyDomain(raw)
  if (!host || host.length > 253) return { ok: false, problem: 'shape' }
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(host) || /(^|\.)xn--/.test(host)) return { ok: false, problem: 'not_ascii' }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes('[') || /^[0-9a-f:]+$/.test(host) && host.includes(':')) return { ok: false, problem: 'ip' }
  const labels = host.split('.')
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return { ok: false, problem: 'shape' }
  if (/^\d+$/.test(labels[labels.length - 1]!)) return { ok: false, problem: 'tld' }
  if (LOCAL.test(host)) return { ok: false, problem: 'reserved' }
  for (const d of [...OURS, opts.consoleHost.toLowerCase(), opts.shopDomain.toLowerCase()]) if (under(host, d)) return { ok: false, problem: 'reserved' }
  const p = parse(host, { allowPrivateDomains: true })
  if (!p.isIcann && !p.isPrivate) return { ok: false, problem: 'tld' }
  if (!p.domain) return { ok: false, problem: 'suffix' }
  // www.<apex> means the apex: connect the apex and send www to it (Vercel's own redirect, D2·4).
  const main = host === `www.${p.domain}` ? p.domain : host
  return { ok: true, facts: { host: main, apex: p.domain, www: main === p.domain ? `www.${p.domain}` : null } }
}

/** The words for a problem (spec § Words on screen): what to do, never why. */
export const DOMAIN_PROBLEM_WORDS: Record<DomainProblem, string> = {
  shape: 'Use a domain like yourbrand.in',
  not_ascii: 'Use the domain in English letters',
  ip: 'Use a domain, not an IP address',
  suffix: 'Add your brand’s name: yourbrand.co.in',
  reserved: 'This domain can’t be connected',
  tld: 'Use a domain like yourbrand.in',
}
