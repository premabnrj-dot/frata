import 'server-only'
import { sql } from 'drizzle-orm'
import { checkDomain, type DomainFacts, type DomainProblem } from '@/domains/addresses/domains'
import { dnsHostOf, type DnsHost } from '@/domains/addresses/dns-hosts'
import { claimDomainRow } from '@/lib/db/platform'
import { withTenant } from '@/lib/db/tenant'
import { caaBlocks, nameServers, pointsAt, txtAtSource, txtValues, type Seen } from '@/lib/connectors/dns'
import { projectDomain, projectRecords, type ProjectRecords } from '@/lib/connectors/vercel'
import { DOMAIN_CAPACITY, isOwnDomainsConfigured } from '@/lib/env'
import { refreshHosts } from '@/lib/storefront/refresh'
import { CONSOLE_HOST, SHOP_DOMAIN } from '@/lib/public-env'
import { enqueue } from '@/lib/outbox'
import { drainSoon } from '@/lib/outbox/drain'
import { errName } from '@/lib/log'
import { fetchWithTimeout } from '@/lib/http/timeout'

// =============================================================================
// FILE: src/lib/domains/own-domains.ts — CONNECT, CHECK AND ADD AN OWN DOMAIN (shop addresses D2·4–D2·6).
// The rules live in drizzle/0082 (the definers) and src/domains/addresses (the shapes); this file only carries facts
// between the internet and them:
//   · claim: shape (checkDomain), then app_claim_domain (who, caps, the token); the records come from the project's
//     own values, so they show at once — nothing reaches Vercel before the row's own proof;
//   · check one row: a lease (one check every 10 s at most), then the lookups OUTSIDE any transaction, then
//     app_domain_record, which says whether to add; the add is an outbox row in that same transaction (ADR-0006);
//   · `forDialog` asks the domain's own name servers for the chips (no public negative cache); the proof is always
//     both public resolvers (app_domain_record decides with them).
// =============================================================================

/** A project host whose config gives the project's own A and CNAME values. */
const PROBE = `www.${SHOP_DOMAIN}`
/** Hosts the platform itself holds on the project (frrata.shop, *.frrata.shop, www): outside the shops' room. */
const PLATFORM_HOSTS = 3

export type Record3 = { type: 'TXT' | 'A' | 'CNAME'; name: string; value: string }
export type Claimed = { id: string; facts: DomainFacts; records: Record3[]; dnsHost: DnsHost | null }
export type ClaimError = DomainProblem | 'not_owner' | 'frozen' | 'blocked' | 'same_apex' | 'ten_today' | 'four_hosts' | 'capacity' | 'off' | 'unknown'

const CLAIM_CODES = ['not_owner', 'frozen', 'blocked', 'same_apex', 'ten_today', 'four_hosts', 'capacity'] as const
const codeOf = <T extends string>(err: unknown, codes: readonly T[]): T | null => {
  const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
  return codes.find((c) => msg.includes(c)) ?? null
}

/** The records a merchant adds, in the order shown (design rule 74): the proof, then where the domain points. */
export function recordsFor(facts: DomainFacts, token: string, project: ProjectRecords): Record3[] {
  const sub = facts.host === facts.apex ? '@' : facts.host.slice(0, -(facts.apex.length + 1))
  return [
    { type: 'TXT', name: '_frrata', value: `frrata-verify=${token}` },
    facts.host === facts.apex ? { type: 'A', name: '@', value: project.a } : { type: 'CNAME', name: sub, value: project.cname },
    ...(facts.www ? [{ type: 'CNAME' as const, name: 'www', value: project.cname }] : []),
  ]
}

/** The text Copy all and Send on WhatsApp share: the domain and its records, nothing else of ours. */
export const recordsText = (host: string, records: Record3[]) => [host, ...records.map((r) => `${r.type}  ${r.name}  ${r.value}`)].join('\n')

export async function claimDomain(tenantId: string, uid: string, raw: string): Promise<{ ok: true; claim: Claimed } | { ok: false; error: ClaimError }> {
  if (!isOwnDomainsConfigured()) return { ok: false, error: 'off' }
  const c = checkDomain(raw, { consoleHost: CONSOLE_HOST, shopDomain: SHOP_DOMAIN })
  if (!c.ok) return { ok: false, error: c.problem }
  const f = c.facts
  try {
    const row = await claimDomainRow(tenantId, uid, { host: f.host, apex: f.apex, withWww: f.www !== null }, DOMAIN_CAPACITY - PLATFORM_HOSTS)
    const [project, ns] = await Promise.all([projectRecords(PROBE), nameServers(f.apex).catch(() => [])])
    return { ok: true, claim: { id: row.id, facts: f, records: recordsFor(f, row.token, project), dnsHost: dnsHostOf(ns) } }
  } catch (err) {
    const code = codeOf(err, CLAIM_CODES)
    if (!code) console.error('[claimDomain]', errName(err))
    return { ok: false, error: code ?? 'unknown' }
  }
}

export type CheckState = 'waiting' | 'securing' | 'connected' | 'not_working' | 'dispute' | 'held' | 'paused' | 'let_go' | 'unknown' | 'gone' | 'busy'
export type Check = { state: CheckState; found: { txt: Seen; points: Seen; www: Seen | null }; stray: string | null; caa: Seen }

/** A text[] parameter that survives being empty or null (drizzle spreads a JS array into a list). */
const textArray = (v: string[] | null) => (v === null ? sql`null::text[]` : sql`array[${sql.join(v.map((x) => sql`${x}`), sql`, `)}]::text[]`)

/** A certificate is live when the host answers over HTTPS at all (any status): the TLS handshake is the check. */
async function certLive(host: string): Promise<Seen> {
  try { await fetchWithTimeout(`https://${host}/`, { method: 'HEAD', redirect: 'manual', cache: 'no-store' }, 4_000); return 'yes' }
  catch { return 'unknown' }
}

/**
 * Checks one row of this shop (the dialog's poll, Check now and the background check alike). `busy`: checked under
 * 10 s ago (the lease), so nothing was looked up. Never calls Vercel's add or verify.
 */
export async function checkDomainRow(tenantId: string, id: string, opts: { forDialog: boolean }): Promise<Check> {
  const idle: Check = { state: 'busy', found: { txt: 'unknown', points: 'unknown', www: null }, stray: null, caa: 'unknown' }
  try {
    return await check(tenantId, id, opts, idle)
  } catch (err) {
    console.error('[checkDomainRow]', errName(err))
    return { ...idle, state: 'unknown' }
  }
}

async function check(tenantId: string, id: string, opts: { forDialog: boolean }, idle: Check): Promise<Check> {
  const [lease] = await withTenant(tenantId, (tx) => tx.execute<{ host: string; apex: string; with_www: boolean; token: string; proved: boolean; added: boolean; main: boolean }>(
    sql`select * from app_domain_lease(${id}::uuid)`))
  if (!lease) return idle
  const project = await projectRecords(PROBE)
  const isApex = lease.host === lease.apex
  const txtName = `_frrata.${lease.apex}`
  const value = `frrata-verify=${lease.token}`
  // Outside any transaction (ADR-0006): every lookup has its own 4–5 s deadline.
  const [both, chip, point, www, caa, onProject] = await Promise.all([
    txtValues(txtName),
    opts.forDialog && !lease.proved ? txtAtSource(txtName, value, lease.apex) : Promise.resolve<Seen>('unknown'),
    pointsAt(lease.host, project, isApex),
    lease.with_www ? pointsAt(`www.${lease.apex}`, project, false) : Promise.resolve(null),
    caaBlocks(lease.apex),
    lease.proved ? projectDomain(lease.host) : Promise.resolve(null),
  ])
  const cert = lease.proved && point.seen === 'yes' && onProject?.onProject ? await certLive(lease.host) : 'unknown'
  const on: Seen = onProject === null ? 'unknown' : onProject.onProject ? 'yes' : 'no'
  const out = await withTenant(tenantId, async (tx) => {
    const [r] = await tx.execute<{ state: CheckState; add_now: boolean }>(
      sql`select * from app_domain_record(${id}::uuid, ${textArray(both?.both ?? null)}, ${textArray(both?.any ?? null)}, ${point.seen}, ${cert}, ${on}, ${DOMAIN_CAPACITY - PLATFORM_HOSTS})`)
    if (r?.add_now) await enqueue(tx, { tenantId, kind: 'domain.add', dedupeKey: `domain.add:${id}:${Math.floor(Date.now() / 3_600_000)}`, payload: { id, host: lease.host, www: lease.with_www ? `www.${lease.apex}` : null } })
    return r
  })
  if (out?.add_now) drainSoon()
  // Proved just now (a move included): the host's cached lookup must stop serving whoever held it (security L4).
  if (!lease.proved && both?.both.includes(value)) refreshHosts(lease.host, ...(lease.with_www ? [`www.${lease.apex}`] : []))
  const txt: Seen = lease.proved ? 'yes' : both?.both.includes(value) ? 'yes' : chip
  return { state: out?.state ?? 'unknown', found: { txt, points: point.seen, www: www?.seen ?? null }, stray: point.found, caa }
}
