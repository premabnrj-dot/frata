import 'server-only'
import { Resolver } from 'node:dns/promises'
import { DOH_BASE } from '@/lib/env'
import { cappedJson, fakeBase } from '../http'

// =============================================================================
// FILE: src/lib/connectors/dns/index.ts — WHAT THE INTERNET SEES FOR A DOMAIN (shop addresses D2·5).
// Proof: Cloudflare AND Google over DNS-over-HTTPS must agree (two resolvers, so one poisoned cache can't prove).
// The dialog's "Found" chips ask the domain's own name servers (a public resolver caches "not there yet" for the
// zone's negative TTL, RFC 2308, so a record just added would lag). Redirects refused; 64 kB cap; 4 s; an answer
// counts only for the name asked; we keep yes / no, never the strings; an error is "unknown", never "no".
// =============================================================================

const FAKE = fakeBase(DOH_BASE)
const RESOLVERS = FAKE ? [`${FAKE}/cloudflare`, `${FAKE}/google`] : ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']
const MS = 4_000
const CAP = 64 * 1024
export type Seen = 'yes' | 'no' | 'unknown'
type Rr = 'TXT' | 'A' | 'CNAME' | 'NS' | 'CAA'
const TYPE: Record<Rr, number> = { A: 1, NS: 2, CNAME: 5, TXT: 16, CAA: 257 }
const bare = (n: string) => n.toLowerCase().replace(/\.$/, '')

/** The answers of one type for exactly `name` from one resolver; null when it couldn't answer. */
async function ask(resolver: string, name: string, type: Rr): Promise<string[] | null> {
  const q = new URLSearchParams({ name, type })
  const r = await cappedJson(`${resolver}?${q}`, { headers: { accept: 'application/dns-json' } }, { ms: MS, cap: CAP })
  const j = r.json as { Status?: number; Answer?: { name?: string; type?: number; data?: string }[] } | null
  if (r.status !== 200 || !j || (j.Status !== 0 && j.Status !== 3)) return null
  return (j.Answer ?? []).filter((a) => a.type === TYPE[type] && typeof a.data === 'string' && bare(a.name ?? '') === bare(name)).map((a) => a.data!)
}
/** A TXT answer's text: its quoted chunks joined. */
const txtOf = (data: string) => data.replace(/^"|"$/g, '').split('" "').join('').replace(/\\"/g, '"')

/** Both resolvers see `value` at `name`: yes; both answer without it: no; anything else: unknown. */
export async function txtSeen(name: string, value: string): Promise<Seen> {
  const both = await Promise.all(RESOLVERS.map((r) => ask(r, name, 'TXT')))
  if (both.some((a) => a === null)) return 'unknown'
  const has = both.map((a) => a!.some((d) => txtOf(d) === value))
  return has.every(Boolean) ? 'yes' : has.some(Boolean) ? 'unknown' : 'no'
}

/** The TXT values at `name` that BOTH resolvers return (null: one couldn't answer). The proof reads this. */
export async function txtValues(name: string): Promise<string[] | null> {
  const both = await Promise.all(RESOLVERS.map((r) => ask(r, name, 'TXT')))
  if (both.some((a) => a === null)) return null
  const [x, y] = both.map((a) => a!.map(txtOf)) as [string[], string[]]
  return [...new Set(x.filter((v) => y.includes(v)))].filter((v) => v.length <= 255).slice(0, 20)
}

/** One resolver, the other if it can't answer. */
async function first(name: string, type: Rr) {
  for (const r of RESOLVERS) { const a = await ask(r, name, type); if (a) return a }
  return null
}

/** Does `host` point at Vercel: the A records (an apex) or the CNAME (a subdomain)? `found` is a checked IPv4, shown, never stored. */
export async function pointsAt(host: string, want: { a: string; cname: string }, apex: boolean): Promise<{ seen: Seen; found: string | null }> {
  if (apex) {
    const a = await first(host, 'A')
    if (!a) return { seen: 'unknown', found: null }
    const v4 = a.filter((x) => /^\d{1,3}(\.\d{1,3}){3}$/.test(x))
    return { seen: v4.length > 0 && v4.every((x) => x === want.a) ? 'yes' : 'no', found: v4.find((x) => x !== want.a) ?? null }
  }
  const c = await first(host, 'CNAME')
  if (!c) return { seen: 'unknown', found: null }
  return { seen: c.some((x) => bare(x) === bare(want.cname) || bare(x).endsWith('.vercel-dns.com') || bare(x).endsWith('.vercel-dns-017.com')) ? 'yes' : 'no', found: null }
}

/** The name servers of a registrable domain (for "Open <provider> DNS"); [] when unknown. */
export async function nameServers(apex: string): Promise<string[]> {
  return ((await first(apex, 'NS')) ?? []).map(bare).filter((n) => /^[a-z0-9.-]{3,253}$/.test(n)).slice(0, 8)
}

/** A CAA record that leaves Let's Encrypt out blocks the certificate. */
export async function caaBlocks(apex: string): Promise<Seen> {
  const c = await first(apex, 'CAA')
  if (!c) return 'unknown'
  const issue = c.filter((d) => /\bissue(wild)?\b/i.test(d))
  return issue.length > 0 && !issue.some((d) => /letsencrypt\.org/i.test(d)) ? 'yes' : 'no'
}

/**
 * TXT straight from the domain's own name server (no public cache), for the dialog's chips only — never a proof.
 * Off this path (the fakes) it falls back to the resolvers.
 */
export async function txtAtSource(name: string, value: string, apex: string): Promise<Seen> {
  if (FAKE) return txtSeen(name, value)
  const ns = (await nameServers(apex))[0]
  if (!ns) return 'unknown'
  const ip = (await first(ns, 'A'))?.find((x) => /^\d{1,3}(\.\d{1,3}){3}$/.test(x))
  if (!ip) return 'unknown'
  const r = new Resolver({ timeout: MS, tries: 1 })
  r.setServers([ip])
  try {
    const rows = await r.resolveTxt(name)
    return rows.some((chunks) => chunks.join('') === value) ? 'yes' : 'no'
  } catch (e) {
    const c = (e as { code?: string }).code
    return c === 'ENOTFOUND' || c === 'ENODATA' ? 'no' : 'unknown'
  }
}
