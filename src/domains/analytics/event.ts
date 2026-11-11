import { z } from 'zod'
import type { Agent } from './device'

// =============================================================================
// FILE: src/domains/analytics/event.ts — THE BEACON'S BODY, as the ingest route accepts it, and the batch it becomes
// for ingest_events() (drizzle-analytics/0002). One schema for both ends: a key renamed here is renamed for the SQL's
// jsonb_to_recordset, which would otherwise store null for a key it doesn't know (impact review 2026-11-11).
// Strict: an unknown key or kind refuses the whole beacon. Everything the shopper's browser sends can be forged, so
// nothing here is billed or trusted (spec: tier 0); lengths are capped and shapes are narrow (security review MED-5).
// Pure.
// =============================================================================

export const EVENT_KINDS = ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'web_vital'] as const
export type EventKind = (typeof EVENT_KINDS)[number]
export const MAX_EVENTS = 50
export const MAX_BODY_BYTES = 8 * 1024

/** A shop path, as `location.pathname` gives it: no query, no fragment (a `#t=` can be a bearer token), ≤ 200. */
const Path = z.string().max(200).regex(/^\/[A-Za-z0-9\-._~/%]*$/)
/** A value that looks like an email address or a phone number: broadcast tools put them in utm_campaign, and a rollup
 * keeps it 2 years (security review 2026-11-11 MED-5). It is dropped, never stored; the event still counts. */
export const looksPersonal = (v: string) => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(v) || /(?:\d[\s().-]?){10,}/.test(v) || /%40/i.test(v)
/** A tag value as typed into a link (utm_*), cleaned the same way on read (cleanValue): printable, ≤ 100. */
const Tag = z.string().min(1).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u).transform((v) => (looksPersonal(v) ? undefined : v))
/** The referring site: a bare hostname, never a URL. */
const Host = z.string().min(1).max(100).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/)

const Event = z.strictObject({
  k: z.enum(EVENT_KINDS),
  /** The tab's first page: the visit's source comes from it. */
  l: z.boolean().optional(),
  p: Path.optional(),
  pid: z.uuid().optional(),
  us: Tag.optional(), um: Tag.optional(), uc: Tag.optional(),
  rh: Host.optional(),
  /** A creator's `?code=` (the same shape the bag store accepts). */
  cc: z.string().regex(/^[A-Za-z0-9]{1,20}$/).optional(),
  gads: z.boolean().optional(), srs: z.boolean().optional(), fb: z.boolean().optional(),
  m: z.enum(['lcp', 'inp', 'cls']).optional(),
  v: z.int().min(0).max(600_000).optional(),
}).refine((e) => (e.k === 'web_vital') === (e.m !== undefined && e.v !== undefined), { message: 'a vital and only a vital has a metric and value' })

export const BeaconZ = z.strictObject({ e: z.array(Event).min(1).max(MAX_EVENTS) })
export type Beacon = z.infer<typeof BeaconZ>
export type BeaconEvent = Beacon['e'][number]

/** What ingest_events() takes: the server's facts about the visit, and the browser's checked events. */
export type IngestBatch = { d: Agent['device']; b: Agent['browser']; a: Agent['inApp']; c: string; e: readonly BeaconEvent[] }

/** The city as Vercel's header gives it (URL-encoded), cleaned and capped; '' when absent or unreadable. */
export function cityOf(header: string | null): string {
  if (!header) return ''
  let s: string
  try { s = decodeURIComponent(header) } catch { return '' }
  s = s.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()
  return s.length <= 60 ? s : ''
}

const HANDLE = /^[a-z0-9-]{1,100}$/
const PAGE = /^[1-9][0-9]{0,4}$/
/**
 * A path as one of the shop's own shapes, never as sent (security review MED-4): a crafted link such as `/9876543210`
 * or a 404 must not keep a phone or an email in raw events for 90 days. Product and collection handles are the
 * merchant's own words ([a-z0-9-]); anything else is "other".
 */
export function pathShape(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  const parts = path.replace(/\/+$/, '').split('/').slice(1)
  const [a, b, c, d] = parts
  if (parts.length === 0 || (parts.length === 1 && a === '')) return '/'
  if (parts.length === 1 && (a === 'products' || a === 'collections' || a === 'bag' || a === 'checkout' || a === 'orders')) return `/${a}`
  if (parts.length === 2 && (a === 'products' || a === 'collections') && HANDLE.test(b!)) return `/${a}/${b}`
  if (parts.length === 2 && a === 'policies' && /^[a-z-]{1,40}$/.test(b!)) return `/policies/${b}`
  if (parts.length === 3 && a === 'products' && b === 'page' && PAGE.test(c!)) return '/products/page'
  if (parts.length === 4 && a === 'collections' && HANDLE.test(b!) && c === 'page' && PAGE.test(d!)) return `/collections/${b}`
  return 'other'
}

export function toBatch(beacon: Beacon, agent: Agent, city: string): IngestBatch {
  return { d: agent.device, b: agent.browser, a: agent.inApp, c: city, e: beacon.e.map((e) => (e.p === undefined ? e : { ...e, p: pathShape(e.p) })) }
}
