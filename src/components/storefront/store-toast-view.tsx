'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { store, storeToast } from './store-toast'

// =============================================================================
// FILE: src/components/storefront/store-toast-view.tsx — the shop's toast as drawn (store-toast.ts holds what it says).
// Its own chunk, loaded after the page. The shop's colours (ink on paper, its good and bad marks), rounded like the
// shop, bottom centre: above checkout's pay bar (`--store-bar`, which the bar sets), above the phone's tabs, else 1 rem
// above the safe area; never over the control it answers (WCAG 2.4.11). Motion is base.css [data-toast] / [data-mark].
// =============================================================================

const OK_MS = 5000
const EXIT_MS = 200 // the exit takes as long as the entrance (base.css [data-toast])

/** Draw the toast into the shop's box (store-toaster.tsx); the returned function takes it away again. */
export function mount(box: HTMLElement) {
  const root = createRoot(box)
  root.render(<View />)
  return () => root.unmount()
}

function View() {
  const t = useSyncExternalStore(store.sub, store.get, () => null)
  const [busy, setBusy] = useState(false)
  const id = t?.id, out = !!t?.out, kind = t?.kind
  useEffect(() => setBusy(false), [id])
  // An ok toast leaves after 5 s; a leaving one is removed once its exit has played.
  useEffect(() => {
    if (id === undefined) return
    const h = out ? setTimeout(() => store.clear(id), EXIT_MS) : kind === 'ok' ? setTimeout(() => storeToast.dismiss(id), OK_MS) : null
    return () => { if (h) clearTimeout(h) }
  }, [id, out, kind])
  // Esc closes an error, unless the shopper is typing or a drawer is open (Esc is theirs then).
  useEffect(() => {
    if (kind !== 'error' || out) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]') || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return
      storeToast.dismiss(id)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [id, kind, out])
  if (!t) return null

  const act = async () => {
    const a = t.action
    if (!a || busy) return
    setBusy(true)
    try { await a.run() } finally { if (store.get()?.id === t.id) { setBusy(false); if (!a.keep) storeToast.dismiss(t.id) } }
  }
  const error = t.kind === 'error'
  return (
    <div key={t.id} data-toast={t.kind} data-leaving={t.out ? '' : undefined} role={error && !t.quiet ? 'alert' : undefined}
      className="fixed inset-x-4 bottom-[var(--store-bar,calc(var(--store-tabs,0px)+1rem+env(safe-area-inset-bottom)))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-store-ink px-3 py-2.5 text-sm text-store-paper shadow-lg print:hidden">
      <span data-mark aria-hidden className={`grid size-5.5 shrink-0 place-items-center rounded-full text-store-paper ${error ? 'bg-store-bad' : 'bg-store-good'}`}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d={error ? 'M8 3.6v5.4M8 12v.4' : 'M3.5 8.4l3 3 6-6.4'} strokeWidth={error ? 2.4 : 2.2} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">{t.text}{t.sub ? <span className="block text-xs opacity-80">{t.sub}</span> : null}</span>
      {t.action ? <button type="button" onClick={act} aria-disabled={busy} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold underline underline-offset-2">{t.action.label}</button> : null}
      {error ? (
        <button type="button" onClick={() => storeToast.dismiss(t.id)} aria-label="Close" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg opacity-80 hover:opacity-100">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      ) : null}
    </div>
  )
}
