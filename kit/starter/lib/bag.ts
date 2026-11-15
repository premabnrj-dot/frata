'use client'

import { useSyncExternalStore } from 'react'

// The shopper's bag on this site, in this browser only. Checkout prices it again on the store's own checkout.
export type Line = { variantId: string; qty: number; title: string; size: string; price: number }
const KEY = 'bag.v1'
const listeners = new Set<() => void>()
let snap: Line[] | null = null
const read = (): Line[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const write = (lines: Line[]) => { snap = lines; try { localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* private window */ } listeners.forEach((l) => l()) }

export const bag = {
  get: (): Line[] => (snap ??= read()),
  add(line: Omit<Line, 'qty'>) {
    const all = bag.get(), at = all.find((l) => l.variantId === line.variantId)
    write(at ? all.map((l) => (l === at ? { ...l, qty: Math.min(10, l.qty + 1) } : l)) : [...all, { ...line, qty: 1 }].slice(-20))
  },
  remove(variantId: string) { write(bag.get().filter((l) => l.variantId !== variantId)) },
}
const EMPTY: Line[] = []
export const useBag = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, bag.get, () => EMPTY)
