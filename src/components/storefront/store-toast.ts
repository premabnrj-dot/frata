import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { ToastAction, ToastApi } from '@/components/ui/toast-context'
import { TOAST_BOX, TOAST_SAY } from './store-toaster'

// =============================================================================
// FILE: src/components/storefront/store-toast.ts — THE SHOP'S TOAST (frata-design-language § Feedback, F3).
//
// The same API as ui/toast (ToastApi: callable for ok, .ok, .error, .update, .dismiss, .next), so useErrorSummary
// runs on it (give it through ToastContext). One toast at a time, a newer one replaces it.
//   ok     leaves after 5 s, no Undo; said through the shop's polite region (store-toaster.tsx).
//   error  stays until ×, Esc or its one action; role="alert". A quiet one (the field summary) is said politely.
// It closes when the page changes (useStoreToast). Never put a shopper's data (a phone, an address) in its words.
// Drawn by store-toast-view.tsx, loaded in its own chunk after the page (a shop page's script budget) into the box
// ShopShell renders on the real shop only: in the console's preview there is no box, and nothing is shown.
// =============================================================================

export type StoreToast = { id: number; kind: 'ok' | 'error'; text: string; sub?: string; action?: ToastAction; quiet?: boolean; out?: boolean }

let now: StoreToast | null = null
let seq = 0
const subs = new Set<() => void>()
const set = (t: StoreToast | null) => { now = t; subs.forEach((f) => f()) }
/** What the view reads (useSyncExternalStore) and how it removes a toast once it has left. */
export const store = {
  get: () => now,
  sub: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } },
  clear: (id: number) => { if (now?.id === id) set(null) },
}

let box: HTMLElement | null = null
let view: Promise<(() => void) | void> | null = null
/** Draw the view into the shop's box (once per box: a move to another part of the shop draws a new shell, so a new
 *  box). False: no box here (the console's preview). */
function load(): boolean {
  const el = typeof document === 'undefined' ? null : document.getElementById(TOAST_BOX)
  if (!el) return false
  if (el !== box) { void view?.then((unmount) => unmount?.()); box = el; view = null }
  // Its chunk did not load (a weak connection): the words still show, plainly, in the box; the next toast tries again.
  // Only this box is reset: a late failure must not undo a newer box (impact review F3).
  view ??= import('./store-toast-view').then((m) => m.mount(el), () => {
    if (box === el) { view = null; box = null }
    if (now) { el.setAttribute('role', now.kind === 'error' && !now.quiet ? 'alert' : 'status'); el.textContent = now.sub ? `${now.text} ${now.sub}` : now.text }
  })
  return true
}
function say(text: string) {
  const el = document.getElementById(TOAST_SAY)
  if (!el) return
  el.textContent = ''
  setTimeout(() => { el.textContent = text }, 50)
}
function put(t: Omit<StoreToast, 'id'>) {
  if (!load()) return
  set({ ...t, id: ++seq })
  if (t.kind === 'ok' || t.quiet) say(t.sub ? `${t.text} ${t.sub}` : t.text)
}

export const storeToast: ToastApi = Object.assign((t: { text: string }) => put({ kind: 'ok', text: t.text }), {
  ok: (text: string, o: { sub?: string } = {}) => put({ kind: 'ok', text, sub: o.sub }),
  error: (text: string, o: { sub?: string; action?: ToastAction; quiet?: boolean } = {}) => put({ kind: 'error', text, ...o }),
  update: (id: number, text: string) => { if (now?.id === id) set({ ...now, text }) },
  dismiss: (id = seq) => { if (now?.id === id && !now.out) set({ ...now, out: true }) },
  next: () => seq + 1,
})

/** The shop's toast for an island. A move to another page closes what is on screen; the view loads once the page has
 *  settled, so a failure later (no connection) can still be shown. */
export function useStoreToast(): ToastApi {
  const path = usePathname()
  useEffect(() => () => storeToast.dismiss(), [path])
  useEffect(() => { const t = setTimeout(load, 2500); return () => clearTimeout(t) }, [])
  return storeToast
}
