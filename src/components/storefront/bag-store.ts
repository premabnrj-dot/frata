'use client'

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

/** Open the bag drawer from anywhere (Add to bag, the header). */
export const openBag = () => window.dispatchEvent(new Event('frata:open-bag'))

export const ATTR_KEY = 'frata.attr.v1'
/** Remember how the shopper arrived (utm_*, fbclid…), for this tab, so the order can say which ad brought it. */
export function captureAttribution() {
  try {
    const p = new URLSearchParams(window.location.search)
    const keep = Object.fromEntries([...p].filter(([k]) => /^(utm_(source|medium|campaign|content|term)|fbclid|gclid)$/.test(k)).map(([k, v]) => [k, v.slice(0, 200)]))
    if (Object.keys(keep).length) sessionStorage.setItem(ATTR_KEY, JSON.stringify(keep))
  } catch { /* storage unavailable */ }
}
