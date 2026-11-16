'use client'

import { readBagBy, type BagBy } from '@/domains/checkout/bag-fill'
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
// Who last filled the bag (src/domains/checkout/bag-fill.ts): `link` (a bag link), `shop` (the shopper on the store's
// own pages), or `keep` (checkout's corrections and its gift button: the marker stays as it was). `shop` stays until
// the bag is cleared or a link from the store's own website replaces it. Every writer names its kind (no default).
// Without storage there is no marker, so a link joins (the safe direction); kept small, it ships on every shop page.
const BY_KEY = 'frrata.bag.by.v1'
export type BagWrite = BagBy | 'keep'
function write(items: BagItem[], by: BagWrite | 'clear') {
  memory = items
  snapshot = items
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
    if (by === 'clear') localStorage.removeItem(BY_KEY)
    else if (by !== 'keep') localStorage.setItem(BY_KEY, by)
  } catch { /* the page keeps it */ }
  listeners.forEach((l) => l())
}

export const bag = {
  get: (): BagItem[] => (snapshot ??= read()),
  /** Who last filled the bag: `link`, `shop`, or null (an empty bag, or one from before the marker). */
  by: (): BagBy | null => { try { return readBagBy(localStorage.getItem(BY_KEY)) } catch { return null } },
  add(variantId: string, qty: number, by: BagWrite) {
    const items = bag.get()
    const at = items.find((i) => i.variantId === variantId)
    write(at ? items.map((i) => (i === at ? { ...i, qty: Math.min(MAX_QTY, i.qty + qty) } : i)) : [...items, { variantId, qty: Math.min(MAX_QTY, qty) }].slice(-MAX_LINES), by)
  },
  set(variantId: string, qty: number, by: BagWrite) { write(qty <= 0 ? bag.get().filter((i) => i.variantId !== variantId) : bag.get().map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(MAX_QTY, qty) } : i)), by) },
  remove(variantId: string, by: BagWrite) { write(bag.get().filter((i) => i.variantId !== variantId), by) },
  /** Make the bag what the server says can be bought: missing ids out, each given line set to its quantity (0 takes it
   * out: sold out or gone). Lines not given are left as they are. */
  reconcile(lines: { variantId: string; qty: number }[], missing: string[]) {
    const keep = new Map(lines.map((l) => [l.variantId, l.qty]))
    write(bag.get().filter((i) => !missing.includes(i.variantId) && keep.get(i.variantId) !== 0)
      .map((i) => (keep.has(i.variantId) ? { ...i, qty: keep.get(i.variantId)! } : i)), 'keep')
  },
  clear() { write([], 'clear') },
  /** The bag a brand's website sent (the bag link, SA1b): its lines become the whole bag. */
  replace(items: BagItem[]) { write(items.map((i) => ({ variantId: i.variantId, qty: Math.min(MAX_QTY, i.qty) })).slice(0, MAX_LINES), 'link') },
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
/** Opens the bag, saying what was just added; `product` names the product when it isn't the page's own (a paired piece),
 * for the visit beacon (src/beacon/fe.ts). */
export const openBag = (added?: string, product?: string) => window.dispatchEvent(Object.assign(new CustomEvent('frata:open-bag', { detail: added ?? null }), product ? { product } : {}))

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

// How the shopper arrived, for this tab (written by capture-attribution.ts, sent with the order).
export const ATTR_KEY = 'frata.attr.v1'
