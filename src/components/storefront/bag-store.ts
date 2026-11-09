'use client'

import { isTagged, landingParams } from '@/domains/analytics/attribution'
import { useSyncExternalStore } from 'react'

// =============================================================================
// THE BAG, in this browser only: variant ids and quantities (checkout spec).
// Prices, stock and totals always come from the server (/api/shop/quote);
// nothing is reserved while a piece sits here. Each shop is its own origin, so
// one shop's bag never shows on another's. Storage may be unavailable (private
// windows): the bag then lives for the page only.
// =============================================================================

export type BagItem = { variantId: string; qty: number }
const KEY = 'frata.bag.v1'
const MAX_QTY = 10, MAX_LINES = 20
let memory: BagItem[] = []
const listeners = new Set<() => void>()

function read(): BagItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x?.variantId === 'string' && Number.isInteger(x?.qty) && x.qty > 0).slice(0, MAX_LINES) : []
  } catch { return memory }
}
let snapshot: BagItem[] | null = null
function write(items: BagItem[]) {
  memory = items
  snapshot = items
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* the page keeps it */ }
  listeners.forEach((l) => l())
}

export const bag = {
  get: (): BagItem[] => (snapshot ??= read()),
  add(variantId: string, qty = 1) {
    const items = bag.get()
    const at = items.find((i) => i.variantId === variantId)
    write(at ? items.map((i) => (i === at ? { ...i, qty: Math.min(MAX_QTY, i.qty + qty) } : i)) : [...items, { variantId, qty: Math.min(MAX_QTY, qty) }].slice(-MAX_LINES))
  },
  set(variantId: string, qty: number) { write(qty <= 0 ? bag.get().filter((i) => i.variantId !== variantId) : bag.get().map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(MAX_QTY, qty) } : i))) },
  remove(variantId: string) { write(bag.get().filter((i) => i.variantId !== variantId)) },
  /** Make the bag what the server says can be bought (gone lines out, quantities cut). */
  reconcile(lines: { variantId: string; qty: number }[], missing: string[]) {
    const keep = new Map(lines.map((l) => [l.variantId, l.qty]))
    write(bag.get().filter((i) => !missing.includes(i.variantId)).map((i) => (keep.has(i.variantId) && keep.get(i.variantId)! > 0 ? { ...i, qty: keep.get(i.variantId)! } : i)))
  },
  clear() { write([]) },
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { snapshot = read(); l() } }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage) }
}
const EMPTY: BagItem[] = []
export const useBag = () => useSyncExternalStore(subscribe, bag.get, () => EMPTY)

/** Open the bag drawer from anywhere (Add to bag, the header); `added` names the line just put in, which the drawer marks. */
export const openBag = (added?: string) => window.dispatchEvent(new CustomEvent('frata:open-bag', { detail: added ?? null }))

// The offer code the shopper typed (one per order), for this tab: every quote and the order carry it. A shop link
// with ?code=… fills it (a creator's or a WhatsApp broadcast's link). Never a price: the server decides what it does.
const CODE_KEY = 'frrata.code.v1'
// Whether the code came from a shop link (?code=): recorded on the order for the leak alert (O·3), never trusted for price.
const VIA_KEY = 'frrata.code-via.v1'
let codeNow: string | null = null
const codeListeners = new Set<() => void>()
const readCode = () => { try { return sessionStorage.getItem(CODE_KEY) } catch { return null } }
export const offerCode = {
  get: () => (codeNow ??= readCode() ?? ''),
  via: (): 'typed' | 'link' => { try { return sessionStorage.getItem(VIA_KEY) === 'link' ? 'link' : 'typed' } catch { return 'typed' } },
  set: (c: string, via: 'typed' | 'link' = 'typed') => {
    const v = c.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20)
    codeNow = v
    try { if (v) { sessionStorage.setItem(CODE_KEY, v); sessionStorage.setItem(VIA_KEY, via) } else { sessionStorage.removeItem(CODE_KEY); sessionStorage.removeItem(VIA_KEY) } } catch { /* the page keeps it */ }
    codeListeners.forEach((l) => l())
  },
}
export const useOfferCode = () => useSyncExternalStore((l) => { codeListeners.add(l); return () => codeListeners.delete(l) }, offerCode.get, () => '')

export const ATTR_KEY = 'frata.attr.v1'
const SEEN_KEY = 'frrata.attr.seen'
/**
 * Remember how the shopper arrived, for this tab, so the order can say where it came from (Analytics A·1; the keys are
 * the domain's ATTRIBUTION_KEYS). A tagged landing (utm or a click id) replaces the whole touch; the referring site is
 * read once, on the tab's first page, and kept as its hostname only (never a path or query). Never on the console's
 * own address (a preview), and a creator's `?code=` still fills the code, credited as a link.
 */
let capturedAt: string | null = null
export function captureAttribution() {
  try {
    if (window.location.pathname.startsWith('/console')) return
    // Once per page: a second run (React's dev double effect, the shell mounting again) must not rewrite the touch.
    if (capturedAt === window.location.href) return
    capturedAt = window.location.href
    const landing = landingParams(window.location.search)
    const first = !sessionStorage.getItem(SEEN_KEY)
    let ref: string | null = null
    if (first && document.referrer) {
      try { const u = new URL(document.referrer); ref = u.hostname || null } catch { /* not a URL */ }
      if (ref === window.location.hostname) ref = null
    }
    if (isTagged(landing)) sessionStorage.setItem(ATTR_KEY, JSON.stringify(ref ? { ...landing, ref_host: ref } : landing))
    else if (ref) sessionStorage.setItem(ATTR_KEY, JSON.stringify({ ref_host: ref }))
    sessionStorage.setItem(SEEN_KEY, '1')
    const code = new URLSearchParams(window.location.search).get('code')
    if (code && /^[A-Za-z0-9]{1,20}$/.test(code)) offerCode.set(code, 'link')
  } catch { /* storage unavailable */ }
}
