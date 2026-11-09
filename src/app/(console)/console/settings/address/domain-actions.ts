'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dnsHostOf } from '@/domains/addresses/dns-hosts'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { nameServers } from '@/lib/connectors/dns'
import { projectRecords } from '@/lib/connectors/vercel'
import { sql } from 'drizzle-orm'
import { asMember } from '@/lib/auth/as-member'
import type { Tx } from '@/lib/db'
import { LIMITS, withinLimit, type Limit } from '@/lib/db/rate-limit'
import { checkDomainRow, claimDomain, recordsFor, type Check, type ClaimError, type Record3 } from '@/lib/domains/own-domains'
import { clientIp, ipBucket } from '@/lib/http/client-ip'
import { errName } from '@/lib/log'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
import { addressFacts, domainClaimFor, shopDomainRows } from '@/lib/queries/addresses'
import { refreshHosts, refreshShop } from '@/lib/storefront/refresh'
import { checkDomain } from '@/domains/addresses/domains'

// =============================================================================
// FILE: settings/address/domain-actions.ts — OWN DOMAINS FROM SETTINGS › SHOP ADDRESS (D2·10; mockup v2, rules 72–76).
// Every action: owners and admins (CAN_MANAGE), never a support visit; a row id only (the host comes from the row);
// rate limits failing closed (the check per member, shop, IP bucket and one budget for all shops); replies are named
// fields and error codes; anything thrown is logged as its name only. The definers check who again.
// =============================================================================

type Who = { tenantId: string; userId: string }
async function owner(): Promise<Who | null> {
  const a = await requireMember(CAN_MANAGE)
  if (!a.ok || a.membership.supportSessionId) return null
  return { tenantId: a.membership.tenantId, userId: a.userId }
}
const Id = z.uuid()
const ERR_WORDS: Record<ClaimError | 'busy' | 'support', string> = {
  shape: 'Use a domain like yourbrand.in', not_ascii: 'Use the domain in English letters', ip: 'Use a domain, not an IP address',
  suffix: 'Add your brand’s name: yourbrand.co.in', reserved: 'This domain can’t be connected', tld: 'Use a domain like yourbrand.in',
  not_owner: 'Only the owner or an admin can connect a domain', frozen: 'Address changes are frozen', blocked: 'This domain can’t be connected',
  same_apex: 'This domain is already connected', ten_today: 'Try again tomorrow', four_hosts: '4 of 4 addresses',
  capacity: 'Not available right now', off: 'Not available right now', unknown: 'We could not connect it. Nothing was changed.',
  busy: 'Try again in a minute', support: 'Only the shop’s owner can do this',
}

/** All of a shop's hosts (names and domains), for refreshing every cached lookup after main or a removal. */
async function hostsOf(tenantId: string, slug: string | null): Promise<string[]> {
  const rows = await shopDomainRows(tenantId).catch(() => [])
  return [...(slug ? [shopHost(slug)] : []), ...rows.flatMap((r) => [r.host, ...(r.withWww ? [`www.${r.host}`] : [])])]
}
/** The shop's own name, read on the server (never taken from the browser: security review D2·10 L1). */
const slugOf = async (tenantId: string) => (await addressFacts(tenantId).catch(() => null))?.slug ?? null
async function refreshAll(who: Who) {
  refreshShop(who.tenantId, 'shop')
  refreshHosts(...(await hostsOf(who.tenantId, await slugOf(who.tenantId))))
  revalidatePath('/console/settings/address')
}

/** Every limit must pass, each failing closed. */
async function within(limits: [Limit, string][]): Promise<boolean> {
  const now = new Date()
  for (const [limit, subject] of limits) if (!(await withinLimit(limit, subject, now, true))) return false
  return true
}
const checkLimits = async (who: Who) => within([[LIMITS.domainCheckMember, who.userId], [LIMITS.domainCheckShop, who.tenantId], [LIMITS.domainCheckIp, ipBucket(await clientIp())], [LIMITS.domainCheckAll, 'all']])

export type Connected = { ok: true; id: string; host: string; www: string | null; records: Record3[]; dns: { name: string; url: string } | null }

/** Connect › Continue: the claim and its records, at once (nothing reaches Vercel before the proof). */
export async function connectDomainAction(raw: string): Promise<Connected | { ok: false; error: string }> {
  const who = await owner()
  if (!who) return { ok: false, error: ERR_WORDS.support }
  const input = z.string().max(300).safeParse(raw)
  if (!input.success) return { ok: false, error: ERR_WORDS.shape }
  if (!(await within([[LIMITS.domainClaimMember, who.userId], [LIMITS.domainClaimShop, who.tenantId], [LIMITS.domainClaimIp, ipBucket(await clientIp())], [LIMITS.domainClaimAll, 'all']]))) return { ok: false, error: ERR_WORDS.busy }
  try {
    const r = await claimDomain(who.tenantId, who.userId, input.data)
    if (!r.ok) return { ok: false, error: ERR_WORDS[r.error] }
    revalidatePath('/console/settings/address')
    return { ok: true, id: r.claim.id, host: r.claim.facts.host, www: r.claim.facts.www, records: r.claim.records, dns: r.claim.dnsHost }
  } catch (err) {
    console.error('[connectDomainAction]', errName(err))
    return { ok: false, error: ERR_WORDS.unknown }
  }
}

/** Continue on a row already claimed: the same records again (the TXT carries the row's own token). */
export async function domainRecordsAction(id: string): Promise<Connected | { ok: false; error: string }> {
  const who = await owner()
  if (!who || !Id.safeParse(id).success) return { ok: false, error: ERR_WORDS.support }
  if (!(await checkLimits(who))) return { ok: false, error: ERR_WORDS.busy }
  try {
    const c = await domainClaimFor(who.tenantId, id)
    if (!c) return { ok: false, error: ERR_WORDS.unknown }
    const facts = checkDomain(c.host, { consoleHost: '', shopDomain: SHOP_DOMAIN })
    const www = c.withWww ? `www.${c.apex}` : null
    const [project, ns] = await Promise.all([projectRecords(`www.${SHOP_DOMAIN}`), nameServers(c.apex).catch(() => [])])
    const f = facts.ok ? facts.facts : { host: c.host, apex: c.apex, www }
    return { ok: true, id, host: c.host, www, records: recordsFor({ ...f, www }, c.token, project), dns: dnsHostOf(ns) }
  } catch (err) {
    console.error('[domainRecordsAction]', errName(err))
    return { ok: false, error: ERR_WORDS.unknown }
  }
}

/** The dialog's 15 s check, and Check now: one row of this shop, rate limited, never an add or a verify. */
export async function checkDomainAction(id: string): Promise<{ ok: true; check: Check } | { ok: false; error: string }> {
  const who = await owner()
  if (!who || !Id.safeParse(id).success) return { ok: false, error: ERR_WORDS.support }
  if (!(await checkLimits(who))) return { ok: false, error: ERR_WORDS.busy }
  const check = await checkDomainRow(who.tenantId, id, { forDialog: true })
  if (check.state === 'connected') revalidatePath('/console/settings/address')
  return { ok: true, check }
}

const WRITE_CODES = ['not_owner', 'no_domain', 'not_ready', 'razorpay'] as const
const WRITE_WORDS: Record<string, string> = {
  not_owner: ERR_WORDS.not_owner, no_domain: 'This domain is no longer connected', not_ready: 'Not connected yet',
  razorpay: 'Razorpay must approve this domain first', unknown: 'We could not change it. Nothing was changed.',
}
type Done = { ok: true } | { ok: false; error: string }

/** A write through asMember (the console's one door; support visits are refused before it runs) and its definer. */
async function write(action: string, target: string | undefined, run: (tx: Tx, w: Who) => Promise<unknown>): Promise<Done & { who?: Who }> {
  try {
    const r = await asMember(CAN_MANAGE, { action, target }, async (tx, auth) => {
      if (auth.membership.supportSessionId) throw new Error('support')
      const w = { tenantId: auth.membership.tenantId, userId: auth.userId }
      await run(tx, w)
      return w
    })
    return r.ok ? { ok: true, who: r.value } : { ok: false, error: r.error }
  } catch (err) {
    if (err instanceof Error && err.message === 'support') return { ok: false, error: ERR_WORDS.support }
    // Our definers raise exactly a code (P0001); anything else is unknown (never matched inside a query's text).
    const cause = (err as { cause?: { code?: string; message?: string } })?.cause
    const code = cause?.code === 'P0001' ? WRITE_CODES.find((c) => cause.message === c) : undefined
    if (!code) console.error(`[${action}]`, errName(err))
    return { ok: false, error: WRITE_WORDS[code ?? 'unknown']! }
  }
}

export async function makeMainAction(id: string): Promise<Done> {
  if (!Id.safeParse(id).success) return { ok: false, error: WRITE_WORDS.unknown! }
  const r = await write('domain.made_main', id, (tx, w) => tx.execute(sql`select app_make_domain_main(${w.tenantId}::uuid, ${w.userId}::uuid, ${id}::uuid)`))
  if (r.ok && r.who) await refreshAll(r.who)
  return r.ok ? { ok: true } : r
}

export async function undoMainAction(): Promise<Done> {
  const r = await write('domain.main_back_to_name', undefined, (tx, w) => tx.execute(sql`select app_unmake_domain_main(${w.tenantId}::uuid, ${w.userId}::uuid)`))
  if (r.ok && r.who) await refreshAll(r.who)
  return r.ok ? { ok: true } : r
}

export async function razorpayOkAction(id: string, ok: boolean): Promise<Done> {
  if (!Id.safeParse(id).success) return { ok: false, error: WRITE_WORDS.unknown! }
  const r = await write('domain.razorpay_ok', id, (tx, w) => tx.execute(sql`select app_domain_razorpay_ok(${w.tenantId}::uuid, ${w.userId}::uuid, ${id}::uuid, ${ok === true})`))
  if (r.ok) revalidatePath('/console/settings/address')
  return r.ok ? { ok: true } : r
}

export async function removeDomainAction(id: string): Promise<Done> {
  const who = await owner()
  if (!who || !Id.safeParse(id).success) return { ok: false, error: ERR_WORDS.support }
  const hosts = await hostsOf(who.tenantId, await slugOf(who.tenantId))
  const r = await write('domain.removed', id, (tx, w) => tx.execute(sql`select app_remove_domain(${w.tenantId}::uuid, ${w.userId}::uuid, ${id}::uuid)`))
  if (r.ok) { refreshShop(who.tenantId, 'shop'); refreshHosts(...hosts); revalidatePath('/console/settings/address') }
  return r.ok ? { ok: true } : r
}
