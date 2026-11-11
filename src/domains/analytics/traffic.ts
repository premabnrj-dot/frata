import { VISITS_MIN } from './judge'
import { sourceOfInputs, type Channel } from './source'

// =============================================================================
// FILE: src/domains/analytics/traffic.ts — VISITS, as Console › Analytics shows them beside A·1's orders (A·2 · A2·4;
// mockup docs/mockups/2026-11-10-analytics-a2.html, as approved). Pure: the read (src/lib/queries/traffic.ts) brings the
// analytics database's rollups, the page joins them to orders by (IST day, source) — never by person — and renders.
//
// Every number here can be forged (tier 0): it is shown, never billed or blocked on. Rows with fewer than 5 visitors
// fold into "Other" over the window shown (security MED-5), and a rate needs enough visits to mean something.
// =============================================================================

export type TrafficTotals = {
  visitors: number; views: number; productVisitors: number; bagVisitors: number; checkoutVisitors: number; orderedVisitors: number
  phone: number; computer: number; tablet: number
}
export type SourceVisitRow = { us: string; um: string; uc: string; rh: string; cc: string; gads: boolean; srs: boolean; fb: boolean; visitors: number; ordered: number }
export type BrowserRow = { device: string; browser: string; inApp: string; visitors: number; ordered: number }
export type CityRow = { city: string; visitors: number; ordered: number }
export type ProductVisitRow = { productId: string; views: number; adds: number }
export type VitalRow = { metric: 'lcp' | 'inp' | 'cls'; n: number; buckets: number[] }
export type ProductLcpRow = { productId: string; n: number; buckets: number[] }
export type TrafficRead = {
  /** The first IST day with any visit, or null before the first. */
  firstDay: string | null
  cur: TrafficTotals; prev: TrafficTotals
  sources: SourceVisitRow[]; browsers: BrowserRow[]; cities: CityRow[]; products: ProductVisitRow[]
  vitals: VitalRow[]; productLcp: ProductLcpRow[]
}

/** Fewer visitors than this in the window, and a row folds into "Other" (security review MED-5: k ≥ 5). */
export const K_MIN = 5
/** A row's own orders per 100 visits once it has this many visits (fewer, and one order swings it by whole points). */
export const ROW_VISITS_MIN = 100
/** The product the analytics database files views under once a shop-day names 1,000 (drizzle-analytics/0003). */
export const OTHER_PRODUCTS = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

export const emptyTotals = (): TrafficTotals => ({ visitors: 0, views: 0, productVisitors: 0, bagVisitors: 0, checkoutVisitors: 0, orderedVisitors: 0, phone: 0, computer: 0, tablet: 0 })

/** Orders per 100 visits, to `digits` decimals (one in tables, two in the strip); null when too few visits to say. */
export function perHundred(orders: number, visits: number, min = ROW_VISITS_MIN, digits = 1): number | null {
  const f = 10 ** digits
  return visits >= min ? Math.round((orders / visits) * 100 * f) / f : null
}
export const enoughVisits = (n: number) => n >= VISITS_MIN

export type SourceVisits = { slug: string; label: string; channel: Channel; visitors: number; ordered: number }

/**
 * Visits by source, classified exactly as orders are (sourceOfInputs, with a creator's label joined from the shop's own
 * codes): the same slug on both sides, so a row's orders and visits are about the same links. A row the rollup folded
 * (rh '*', past its top 200) is "other".
 */
export function visitsBySource(rows: readonly SourceVisitRow[], labels: ReadonlyMap<string, string>): Map<string, SourceVisits> {
  const out = new Map<string, SourceVisits>()
  const add = (slug: string, label: string, channel: Channel, r: SourceVisitRow) => {
    const s = out.get(slug) ?? { slug, label, channel, visitors: 0, ordered: 0 }
    s.visitors += r.visitors; s.ordered += r.ordered
    out.set(slug, s)
  }
  const or = (v: string) => (v === '' ? null : v)
  for (const r of rows) {
    if (r.rh === '*') { add('other', 'Other', 'other', r); continue }
    const cl = r.cc ? labels.get(r.cc.toUpperCase()) ?? null : null
    const s = sourceOfInputs({ us: or(r.us), um: or(r.um), uc: or(r.uc), rh: or(r.rh), gads: r.gads, srs: r.srs, fb: r.fb, cl, cc: cl ? r.cc : null })
    add(s.slug, s.label, s.channel, r)
  }
  return out
}

const BROWSER_NAME: Record<string, string> = { chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox', samsung: 'Samsung Internet', edge: 'Edge', opera: 'Opera', other: 'Other browsers' }
const APP_NAME: Record<string, string> = { instagram: 'Instagram’s in-app browser', facebook: 'Facebook’s in-app browser', whatsapp: 'WhatsApp’s in-app browser' }
export type Share = { name: string; visitors: number; share: number; perHundred: number | null }

/** Where they browse: each in-app browser, then each browser, as shares of visits; small ones fold into "Other". */
export function browserShares(rows: readonly BrowserRow[], keep = 6): Share[] {
  const by = new Map<string, { visitors: number; ordered: number }>()
  for (const r of rows) {
    const name = r.inApp ? APP_NAME[r.inApp] ?? 'Other apps' : BROWSER_NAME[r.browser] ?? 'Other browsers'
    const g = by.get(name) ?? { visitors: 0, ordered: 0 }
    g.visitors += r.visitors; g.ordered += r.ordered
    by.set(name, g)
  }
  const total = [...by.values()].reduce((n, g) => n + g.visitors, 0)
  return fold([...by.entries()].map(([name, g]) => ({ name, ...g })), keep, total)
}

/** Cities by visits; '' (unknown) and small ones fold into "Other". */
export function cityShares(rows: readonly CityRow[], keep = 8): Share[] {
  const total = rows.reduce((n, r) => n + r.visitors, 0)
  return fold(rows.map((r) => ({ name: r.city || 'Other', visitors: r.visitors, ordered: r.ordered })), keep, total)
}

function fold(groups: { name: string; visitors: number; ordered: number }[], keep: number, total: number): Share[] {
  const named = groups.filter((g) => g.name !== 'Other' && g.name !== 'Other browsers' && g.visitors >= K_MIN).sort((a, b) => b.visitors - a.visitors || a.name.localeCompare(b.name))
  const shown = named.slice(0, keep)
  const rest = groups.filter((g) => !shown.includes(g))
  const out: Share[] = shown.map((g) => ({ name: g.name, visitors: g.visitors, share: total ? g.visitors / total : 0, perHundred: perHundred(g.ordered, g.visitors) }))
  const restV = rest.reduce((n, g) => n + g.visitors, 0), restO = rest.reduce((n, g) => n + g.ordered, 0)
  if (restV) out.push({ name: 'Other', visitors: restV, share: total ? restV / total : 0, perHundred: perHundred(restO, restV) })
  return out
}

export type FunnelStep = { name: string; fromOrders: boolean; n: number; ofAbove: number | null }

/** From visit to delivered: four steps counted by visits, then orders and deliveries from the shop's orders. */
export function funnel(t: TrafficTotals, orders: number, delivered: number): { steps: FunnelStep[]; drop: { from: string; to: string; leave: number } | null } {
  const raw: [string, boolean, number][] = [['Visits', false, t.visitors], ['Saw a product', false, t.productVisitors], ['Added to bag', false, t.bagVisitors],
    ['Started checkout', false, t.checkoutVisitors], ['Ordered', true, orders], ['Delivered', true, delivered]]
  const steps = raw.map(([name, fromOrders, n], i) => ({ name, fromOrders, n, ofAbove: i && raw[i - 1]![2] ? n / raw[i - 1]![2] : null }))
  // The biggest drop between the visit steps and the order (deliveries come later, so they aren't judged here).
  let drop: { from: string; to: string; leave: number } | null = null
  for (let i = 1; i <= 4; i++) {
    const s = steps[i]!
    if (s.ofAbove === null || steps[i - 1]!.n < K_MIN) continue
    const leave = 1 - Math.min(1, s.ofAbove)
    if (!drop || leave > drop.leave) drop = { from: steps[i - 1]!.name, to: s.name, leave }
  }
  return { steps, drop }
}

/** The value at the 75th percentile of a 64-bucket log histogram (bucket i holds floor(ln(v+1)/ln 1.2) = i), as the
 * bucket's geometric middle: within ±10% (an upper edge would read up to 20% slow, and judge a shop just under Google's
 * line as not good). Null with no samples. */
export function p75(buckets: readonly number[]): number | null {
  const n = buckets.reduce((a, b) => a + b, 0)
  if (!n) return null
  let seen = 0
  for (let i = 0; i < buckets.length; i++) {
    seen += buckets[i]!
    if (seen >= n * 0.75) return Math.pow(1.2, i + 0.5) - 1
  }
  return Math.pow(1.2, buckets.length - 0.5) - 1
}

export const addBuckets = (a: readonly number[], b: readonly number[]) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0))

export type Speed = { lcpMs: number | null; inpMs: number | null; cls: number | null; verdict: 'good' | 'improve' | 'poor' | null; samples: number }
/** Speed on phones, as Google judges it (web.dev thresholds): good when every one is good, poor when any is poor. */
export function speedOf(vitals: readonly VitalRow[]): Speed {
  const sum = (m: VitalRow['metric']) => vitals.filter((v) => v.metric === m).reduce((acc, v) => ({ n: acc.n + v.n, b: addBuckets(acc.b, v.buckets) }), { n: 0, b: [] as number[] })
  const l = sum('lcp'), i = sum('inp'), c = sum('cls')
  const lcpMs = p75(l.b), inpMs = p75(i.b), clsK = p75(c.b)
  const cls = clsK === null ? null : clsK / 1000
  const samples = l.n
  if (lcpMs === null) return { lcpMs, inpMs, cls, verdict: null, samples }
  const poor = lcpMs > 4000 || (inpMs ?? 0) > 500 || (cls ?? 0) > 0.25
  const good = lcpMs <= 2500 && (inpMs ?? 0) <= 200 && (cls ?? 0) <= 0.1
  return { lcpMs, inpMs, cls, verdict: poor ? 'poor' : good ? 'good' : 'improve', samples }
}

/** The product page that loads slowest at the 75th percentile, among those with at least 20 samples. */
export function slowestPage(rows: readonly ProductLcpRow[], min = 20): { productId: string; lcpMs: number } | null {
  let best: { productId: string; lcpMs: number } | null = null
  for (const r of rows) {
    if (r.n < min || r.productId === OTHER_PRODUCTS) continue
    const v = p75(r.buckets)
    if (v !== null && (!best || v > best.lcpMs)) best = { productId: r.productId, lcpMs: v }
  }
  return best
}

export type ProductLine = { productId: string; title: string; handle: string; views: number; bagged: number | null; ordered: number; hint: string | null }
/**
 * The most viewed products, by the shop's own names: an id the shop doesn't have (a forged beacon, or "other products"
 * past the day's 1,000) is never named. A product viewed often but rarely bagged says so.
 */
export function productLines(rows: readonly ProductVisitRow[], names: ReadonlyMap<string, { title: string; handle: string; ordered: number }>, keep = 6): ProductLine[] {
  const by = new Map<string, { views: number; adds: number }>()
  for (const r of rows) {
    if (!names.has(r.productId)) continue
    const g = by.get(r.productId) ?? { views: 0, adds: 0 }
    g.views += r.views; g.adds += r.adds
    by.set(r.productId, g)
  }
  const all = [...by.entries()].filter(([, g]) => g.views >= K_MIN)
  const views = all.reduce((n, [, g]) => n + g.views, 0), adds = all.reduce((n, [, g]) => n + g.adds, 0)
  const avg = views ? adds / views : 0
  return all.sort((a, b) => b[1].views - a[1].views).slice(0, keep).map(([id, g]) => {
    const n = names.get(id)!
    const bagged = g.views >= ROW_VISITS_MIN ? g.adds / g.views : null
    return { productId: id, title: n.title, handle: n.handle, views: g.views, bagged, ordered: n.ordered,
      hint: bagged !== null && avg > 0 && bagged < avg / 2 ? 'Looked at often, rarely bagged' : null }
  })
}
