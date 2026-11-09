import 'server-only'
import { VERCEL_API_BASE, VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from '@/lib/env'
import { cappedJson, fakeBase } from '../http'

// =============================================================================
// FILE: src/lib/connectors/vercel/index.ts — THE ONE OWNER OF THE VERCEL TOKEN (shop addresses D2·4).
// Facts: frata-integrations § Domains (checked 2026-11-09). Only add and remove leave as outbox rows (src/lib/domains/
// senders.ts), and add only after the shop's own TXT proof; config and the project's record values are direct reads.
// Every host is re-checked for its shape and encoded; replies are capped at 64 kB; a body is never logged.
// =============================================================================

const BASE = fakeBase(VERCEL_API_BASE) ?? 'https://api.vercel.com'
const MS = 5_000
const CAP = 64 * 1024
const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

function url(path: string, q: Record<string, string> = {}) {
  const p = new URLSearchParams({ ...q, ...(VERCEL_TEAM_ID ? { teamId: VERCEL_TEAM_ID } : {}) })
  return `${BASE}${path}?${p}`
}
const headers = () => ({ authorization: `Bearer ${VERCEL_API_TOKEN}`, 'content-type': 'application/json' })
function host(h: string): string {
  if (!HOST.test(h)) throw new Error('vercel: bad host')
  return encodeURIComponent(h)
}
const project = () => encodeURIComponent(VERCEL_PROJECT_ID)
const code = (j: unknown) => ((j as { error?: { code?: string } } | null)?.error?.code ?? '')

export type AddResult =
  | { ok: true }
  /** Another Vercel account holds the domain: its owner adds Vercel's own TXT (`_vercel`), shown once and kept. */
  | { ok: false; why: 'other_account'; vercelTxt: string | null }
  /** The project is full (Hobby 50) or Vercel's own limit: our failure, shown as "Checking paused". */
  | { ok: false; why: 'limit' }
  | { ok: false; why: 'error'; status: number }

/** Adds `h` to the project; `redirectTo` makes it Vercel's own 308 to that host (www → apex). */
export async function addDomain(h: string, redirectTo?: string): Promise<AddResult> {
  const r = await cappedJson(url(`/v10/projects/${project()}/domains`), {
    method: 'POST', headers: headers(), body: JSON.stringify({ name: decodeURIComponent(host(h)), ...(redirectTo ? { redirect: decodeURIComponent(host(redirectTo)), redirectStatusCode: 308 } : {}) }),
  }, { ms: MS, cap: CAP })
  if (r.status === 200 || r.status === 201) return { ok: true }
  const c = code(r.json)
  // A 409's codes aren't documented with certainty [U]: ask whether it is on OUR project instead of trusting the code.
  // On ours is success only when the database says no other shop holds it live (the sender checks that first).
  if (r.status === 409) {
    const here = await projectDomain(h)
    if (here?.onProject) return { ok: true }
    const v = (r.json as { error?: { verification?: { type?: string; value?: string }[] } } | null)?.error?.verification?.find((x) => x.type === 'TXT')?.value ?? null
    return here ? { ok: false, why: 'other_account', vercelTxt: v && v.length <= 255 ? v : null } : { ok: false, why: 'error', status: 409 }
  }
  if (r.status === 402 || r.status === 429 || /limit/i.test(c)) return { ok: false, why: 'limit' }
  return { ok: false, why: 'error', status: r.status }
}

export type ProjectDomain = { onProject: true; verified: boolean } | { onProject: false } | null

/** Is `h` on our project, and verified? null: we couldn't tell (never treated as "no"). */
export async function projectDomain(h: string): Promise<ProjectDomain> {
  const r = await cappedJson(url(`/v9/projects/${project()}/domains/${host(h)}`), { headers: headers() }, { ms: MS, cap: CAP })
  if (r.status === 404) return { onProject: false }
  if (r.status !== 200) return null
  return { onProject: true, verified: (r.json as { verified?: boolean }).verified === true }
}

/** Asks Vercel to check `h`'s ownership again (limited: call only once our TXT is seen). */
export async function verifyDomain(h: string): Promise<boolean | null> {
  const r = await cappedJson(url(`/v9/projects/${project()}/domains/${host(h)}/verify`), { method: 'POST', headers: headers() }, { ms: MS, cap: CAP })
  if (r.status === 200) return (r.json as { verified?: boolean }).verified === true
  return r.status === 400 ? false : null
}

/** Vercel's view of `h`'s records: misconfigured or not; null when we couldn't tell. */
export async function domainMisconfigured(h: string): Promise<boolean | null> {
  const r = await cappedJson(url(`/v6/domains/${host(h)}/config`, { projectIdOrName: VERCEL_PROJECT_ID }), { headers: headers() }, { ms: MS, cap: CAP })
  if (r.status !== 200) return null
  const m = (r.json as { misconfigured?: unknown }).misconfigured
  return typeof m === 'boolean' ? m : null
}

export async function removeDomain(h: string): Promise<'removed' | 'gone' | 'error'> {
  const r = await cappedJson(url(`/v9/projects/${project()}/domains/${host(h)}`), { method: 'DELETE', headers: headers() }, { ms: MS, cap: CAP })
  return r.status === 200 || r.status === 204 ? 'removed' : r.status === 404 ? 'gone' : 'error'
}

/**
 * The records every domain on this project uses (A for an apex, CNAME for a subdomain), read once from a host already
 * on the project and kept for the process; Vercel's published defaults until then (frata-integrations § Domains).
 */
export type ProjectRecords = { a: string; cname: string }
const DEFAULTS: ProjectRecords = { a: '76.76.21.21', cname: 'cname.vercel-dns.com' }
let records: { at: number; value: ProjectRecords } | null = null
export async function projectRecords(probe: string): Promise<ProjectRecords> {
  if (records && Date.now() - records.at < 6 * 3600_000) return records.value
  const r = await cappedJson(url(`/v6/domains/${host(probe)}/config`, { projectIdOrName: VERCEL_PROJECT_ID }), { headers: headers() }, { ms: MS, cap: CAP })
  const j = r.json as { recommendedIPv4?: { rank: number; value: string[] }[]; recommendedCNAME?: { rank: number; value: string }[] } | null
  const a = j?.recommendedIPv4?.find((x) => x.rank === 1)?.value?.[0]
  const cname = j?.recommendedCNAME?.find((x) => x.rank === 1)?.value?.replace(/\.$/, '')
  const value = { a: a && /^\d{1,3}(\.\d{1,3}){3}$/.test(a) ? a : DEFAULTS.a, cname: cname && HOST.test(cname) ? cname : DEFAULTS.cname }
  if (r.status === 200) records = { at: Date.now(), value }
  return value
}
