import { landingParams } from '@/domains/analytics/attribution'

// =============================================================================
// FILE: src/beacon/fe.ts — THE SHOP'S VISIT BEACON (A·2; plan docs/plans/2026-11-11-guardrails-infra-a2.md, A2·2 amendment and
// its speed and security reviews). Bundled by scripts/build-beacon.mjs into public/fe.js (committed, hashed into
// BEACON_VERSION, checked by `check:beacon`), served on every shop host as /fe.js and loaded `async` by the shop shell.
// Not React and not hydrated, so no shop page's first-load script grows.
//
// It never reads location.href or hash, document.URL or cookies; it never writes to the page; it doesn't run in a frame
// or twice. It reads the path, the landing's query (A·1's own parser) and the referrer's hostname. Everything is
// queued and sent in one sendBeacon when the tab hides or the page goes, in bodies under 7,000 characters.
// =============================================================================

type Ev = Record<string, string | number | boolean>
const W = window as Window & { __fe?: 1 }
const D = document
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL = undefined

function store(get: (s: Storage) => string | null | void): string | null | void {
  try { return get(sessionStorage) } catch { return NIL }
}

if (W.top === W.self && !W.__fe && !location.pathname.startsWith('/console')) {
  W.__fe = 1
  let q: Ev[] = []
  let path = ''
  let pid: string | undefined
  const seen: Record<string, 1> = {}
  const push = (e: Ev) => { if (q.length < 50) q.push(e) }
  const cut = (v: string | undefined) => (v ? v.slice(0, 100) : NIL)

  /** The page's server-drawn markers: view_item (with its product) and begin_checkout, once per kind, product and path. */
  const marks = () => {
    pid = NIL
    D.querySelectorAll<HTMLElement>('[data-fe]').forEach((m) => {
      const k = m.dataset.fe
      const id = m.dataset.pid && UUID.test(m.dataset.pid) ? m.dataset.pid : NIL
      if (k === 'view_item') pid = id
      const key = `${k}${id ?? ''}${location.pathname}`
      if ((k === 'view_item' || k === 'begin_checkout') && !seen[key]) { seen[key] = 1; push(id ? { k, pid: id } : { k }) }
    })
  }

  /** A page view when the path changes (a size guide's same-URL history entry is not one). */
  const view = () => {
    const p = location.pathname
    if (p === path) return
    path = p
    const e: Ev = { k: 'page_view', p: p.slice(0, 200) }
    if (!store((s) => s.getItem('fe.l'))) {
      store((s) => s.setItem('fe.l', '1'))
      const a = landingParams(location.search)
      const code = new URLSearchParams(location.search).get('code')
      let rh: string | undefined
      try { rh = D.referrer ? new URL(D.referrer).hostname : NIL } catch { rh = NIL }
      const src: Record<string, string | boolean | undefined> = {
        l: true, us: cut(a.utm_source), um: cut(a.utm_medium), uc: cut(a.utm_campaign),
        rh: rh && rh !== location.hostname && rh.length <= 100 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(rh) ? rh : NIL,
        cc: code && /^[A-Za-z0-9]{1,20}$/.test(code) ? code : NIL,
        gads: !!(a.gclid || a.gbraid || a.wbraid || a.gad_source) || NIL, srs: !!a.srsltid || NIL, fb: !!a.fbclid || NIL,
      }
      for (const k in src) if (src[k] !== NIL) e[k] = src[k]!
    }
    push(e)
    // The checkout leaves this flag just before it goes to the order page: one purchase per order, never per reopen.
    if (store((s) => s.getItem('fe.p'))) { store((s) => s.removeItem('fe.p')); push({ k: 'purchase' }) }
    setTimeout(marks, 0)
  }

  // Phones' Web Vitals, 1 page load in 4: LCP, CLS (the largest session window), INP (the slowest interaction).
  let vitals: (() => void) | undefined
  if (matchMedia('(pointer: coarse)').matches && Math.random() < 0.25) {
    let lcp = 0, cls = 0, win = 0, first = 0, last = 0, inp = 0
    const obs = (type: string, f: (e: PerformanceEntry & { value?: number; hadRecentInput?: boolean; interactionId?: number }) => void, more?: object) => {
      try { new PerformanceObserver((l) => l.getEntries().forEach(f)).observe({ type, buffered: true, ...more }) } catch { /* not supported */ }
    }
    obs('largest-contentful-paint', (e) => { lcp = e.startTime })
    obs('layout-shift', (e) => {
      if (e.hadRecentInput) return
      if (e.startTime - last > 1000 || e.startTime - first > 5000) { first = e.startTime; win = 0 }
      last = e.startTime; win += e.value ?? 0; cls = Math.max(cls, win)
    })
    obs('event', (e) => { if (e.interactionId) inp = Math.max(inp, e.duration) }, { durationThreshold: 40 })
    let hardPid: string | undefined
    setTimeout(() => { marks(); hardPid = pid }, 0)
    vitals = () => {
      vitals = NIL
      const put = (m: string, v: number) => push({ k: 'web_vital', m, v: Math.min(600000, Math.round(v)), ...(hardPid ? { pid: hardPid } : {}) })
      if (lcp) put('lcp', lcp)
      put('cls', cls * 1000)
      if (inp) put('inp', inp)
    }
  }

  const flush = () => {
    marks()
    vitals?.()
    while (q.length) {
      let n = q.length
      let body = JSON.stringify({ e: q })
      while (body.length > 7000 && n > 1) { n >>= 1; body = JSON.stringify({ e: q.slice(0, n) }) }
      q = q.slice(n)
      navigator.sendBeacon('/api/shop/e', body)
    }
  }

  W.addEventListener('frata:open-bag', (e) => { if ((e as CustomEvent).detail) push(pid ? { k: 'add_to_cart', pid } : { k: 'add_to_cart' }) })
  const pushState = history.pushState
  history.pushState = function (...a: Parameters<History['pushState']>) { pushState.apply(this, a); setTimeout(view, 0) }
  W.addEventListener('popstate', () => setTimeout(view, 0))
  W.addEventListener('pageshow', (e) => { if (e.persisted) { path = ''; view() } })
  D.addEventListener('visibilitychange', () => { if (D.visibilityState === 'hidden') flush() })
  W.addEventListener('pagehide', flush)
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', view)
  else view()
}
