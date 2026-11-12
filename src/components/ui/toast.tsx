'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { announce } from '@/components/shell/announce'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/toast.tsx
//
// FEEDBACK AFTER AN ACTION (frata-design-language § Feedback, owner 2026-11-12; § Work queues 4). Two kinds:
//   ok     — a routine action happened, with Undo for 8 seconds where it is reversible. The window pauses while the
//            pointer OR focus is on the toast (WCAG 2.2.1); under reduced motion the emptying bar becomes the words
//            "Undo for 8 seconds" (§ UX foundation 25). Spoken through the shell's ONE polite region (announce()).
//   error  — something the person did failed (a refusal, a conflict, no connection, fields to fix). It NEVER leaves by
//            itself (2.2.1; Atlassian, Material, Razorpay Blade 2026): × or Esc closes it, or its one action (Try
//            again / Reload / Show). It is its own role="alert" (4.1.3), not the polite region.
// One toast at a time: a new one replaces the last. Every timer is held in a ref and cleared when a newer toast
// arrives, so a leaving or an earlier undo's result never overwrites the toast on screen (impact review 2026-11-07).
// ONE Toaster per surface: AppShell mounts it for the console, Admin and partner (inside [data-shell], outside
// main#content: the shell's font and focus ring, never under main's aria-busy); the signed-in public pages (login,
// start, choose, handover) mount it in their layout, the look editor in F1 (its byte budget: it drops its own toast
// then); never a public marketing page (rule 44). The
// shop's is its own small component (F3). A page without the shell gets this Toaster's own polite region (`region`).
// While a modal Dialog is open the rest of the page is inert and hidden from screen readers, so a toast raised then is
// drawn INSIDE that dialog (a portal); it moves back out when the dialog closes. An error toast leaves when the page
// changes (its action belongs to the page it came from). Admin (`calm`): the mark fades in on the standard easing,
// never a spring or snap (§ UX foundation 22).
// =============================================================================

export const UNDO_MS = 8000
const EXIT_MS = 200 // the exit takes as long as the entrance (base.css [data-toast])

type Action = { label: string; run: () => void | Promise<void>; /** Stay after it runs (the field summary's Show). */ keep?: boolean }
type Toast = {
  id: number
  kind: 'ok' | 'error'
  text: string
  /** One short second line ("Nothing was changed."). */
  sub?: string
  undo?: () => Promise<{ ok: boolean; error?: string }>
  /** An error's one action. */
  action?: Action
  /** An error said once politely instead of as an alert (the field summary: focus is already on the field, and each
   *  count-down would otherwise be read aloud again). */
  quiet?: boolean
}
type Show = (t: { text: string; undo?: Toast['undo'] }) => void
export type ToastApi = Show & {
  ok: (text: string, o?: { undo?: Toast['undo']; sub?: string }) => void
  error: (text: string, o?: { sub?: string; action?: Action; quiet?: boolean }) => void
  /** Replaces the text of the toast on screen if it is still `id` (the field-error summary counting down). */
  update: (id: number, text: string) => void
  /** Closes the toast on screen if it is still `id` (or any, without an id). */
  dismiss: (id?: number) => void
  /** The id the NEXT toast will get (so a caller can update or dismiss what it showed). */
  next: () => number
}

const Ctx = createContext<ToastApi | null>(null)

/** `toast({ text, undo })`, `toast.ok(...)`, `toast.error(...)` from anywhere inside <Toaster>. */
export function useToast(): ToastApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast outside <Toaster>')
  return api
}

export function Toaster({ children, tone = 'app', calm = false, region = true }: {
  children: React.ReactNode
  tone?: 'app' | 'store'
  /** Admin: no snap on the mark. */
  calm?: boolean
  /** Render a polite region for announce() (false inside AppShell, which has its own). */
  region?: boolean
}) {
  const [toast, setToast] = useState<Toast | null>(null)
  const [host, setHost] = useState<HTMLDialogElement | null>(null)
  const pathname = usePathname()
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState({ hover: false, focus: false })
  const paused = held.hover || held.focus
  const seq = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const life = useRef<ReturnType<typeof setTimeout> | null>(null), exit = useRef<ReturnType<typeof setTimeout> | null>(null)
  const left = useRef(UNDO_MS), started = useRef(0)
  const timed = toast?.kind === 'ok'

  const clearAll = () => { if (life.current) clearTimeout(life.current); if (exit.current) clearTimeout(exit.current); life.current = exit.current = null }
  const leave = useCallback((id = seq.current) => {
    if (seq.current !== id) return
    if (life.current) { clearTimeout(life.current); life.current = null }
    setLeaving(true)
    exit.current = setTimeout(() => { if (seq.current === id) { setToast(null); setLeaving(false) } }, EXIT_MS)
  }, [])
  const run = useCallback((ms: number) => {
    clearAll()
    started.current = Date.now(); left.current = ms // clock-ok: in an effect or handler, after mount
    life.current = setTimeout(() => leave(), ms)
  }, [leave])

  // Hover and focus each hold an ok toast's window open; it runs again only when neither does. Errors have no window.
  useEffect(() => {
    if (!toast || leaving || !timed) return
    if (paused) { if (life.current) { clearTimeout(life.current); life.current = null; left.current -= Date.now() - started.current } } // clock-ok: in an effect, after mount
    else if (!life.current) run(Math.max(1500, left.current))
  }, [paused, toast, leaving, timed, run])
  useEffect(() => clearAll, [])

  // An error toast belongs to the page it came from: a move to another page closes it.
  const shownOn = useRef(pathname)
  useEffect(() => {
    if (shownOn.current === pathname) return
    shownOn.current = pathname
    if (toast?.kind === 'error') leave(toast.id)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps -- only a change of page
  // The dialog the toast is drawn in closed: the toast moves back to the page.
  useEffect(() => {
    if (!host) return
    const back = () => setHost(null)
    host.addEventListener('close', back)
    return () => host.removeEventListener('close', back)
  }, [host])

  // Esc closes an error toast, unless a dialog is open (Esc is the dialog's then).
  useEffect(() => {
    if (toast?.kind !== 'error' || leaving) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) leave(toast.id) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toast, leaving, leave])

  const put = useCallback((t: Omit<Toast, 'id'>) => {
    seq.current++
    clearAll(); setLeaving(false); setBusy(false); setHeld({ hover: false, focus: false })
    setToast({ ...t, id: seq.current })
    shownOn.current = window.location.pathname
    setHost([...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1) ?? null)
    if (t.kind === 'ok') { announce(t.undo ? `${t.text} Undo for ${UNDO_MS / 1000} seconds.` : t.text); run(UNDO_MS) }
    else if (t.quiet) announce(t.text)
    return seq.current
  }, [run])

  const api = useMemo<ToastApi>(() => Object.assign(
    ((t: { text: string; undo?: Toast['undo'] }) => { put({ kind: 'ok', ...t }) }) as Show,
    {
      ok: (text: string, o: { undo?: Toast['undo']; sub?: string } = {}) => { put({ kind: 'ok', text, ...o }) },
      error: (text: string, o: { sub?: string; action?: Action; quiet?: boolean } = {}) => { put({ kind: 'error', text, ...o }) },
      update: (id: number, text: string) => { if (seq.current === id) setToast((t) => (t && t.id === id ? { ...t, text } : t)) },
      dismiss: (id?: number) => leave(id ?? seq.current),
      next: () => seq.current + 1,
    },
  ), [put, leave])

  const undo = async () => {
    if (!toast?.undo || busy) return
    const id = seq.current
    setBusy(true); clearAll(); setLeaving(false)
    const r = await toast.undo().catch(() => ({ ok: false, error: 'We could not undo that. Open the order to see where it is.' }))
    // A newer toast arrived while this undo ran: its result is not news on top of it.
    if (seq.current !== id) return
    setBusy(false)
    // Same toast, new words: no remount, so keyboard focus stays on the toast, which now says what happened.
    const said = r.ok ? 'Undone.' : r.error ?? 'We could not undo that.'
    setToast({ id, kind: r.ok ? 'ok' : 'error', text: said })
    if (r.ok) { announce(said); run(4000) }
    box.current?.focus()
  }
  const act = async () => {
    const a = toast?.action
    if (!a || busy) return
    const id = seq.current
    setBusy(true)
    try { await a.run() } finally { if (seq.current === id) { setBusy(false); if (!a.keep) leave(id) } }
  }

  const store = tone === 'store'
  const el = toast ? (
        <div key={toast.id} ref={box} tabIndex={-1} data-toast={toast.kind} data-leaving={leaving ? '' : undefined} data-calm={calm ? '' : undefined}
          role={toast.kind === 'error' && !toast.quiet ? 'alert' : undefined}
          onPointerEnter={() => setHeld((h) => ({ ...h, hover: true }))} onPointerLeave={() => setHeld((h) => ({ ...h, hover: false }))}
          onFocus={() => setHeld((h) => ({ ...h, focus: true }))} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld((h) => ({ ...h, focus: false })) }}
          className={cn('fixed inset-x-4 z-50 mx-auto flex max-w-md items-center gap-3 overflow-hidden px-3 py-2.5 text-sm print:hidden',
            store ? 'bottom-[calc(var(--store-bar,5.5rem)+1rem+env(safe-area-inset-bottom))] rounded-xl bg-store-ink text-store-paper' : 'bottom-[calc(var(--toast-lift,0px)+1rem+env(safe-area-inset-bottom))] rounded-md bg-primary text-primary-foreground md:bottom-[calc(var(--toast-lift,0px)+1.5rem)]',
            toast.kind === 'error' && (store ? 'ring-1 ring-store-bad/60' : 'ring-1 ring-danger-mark/60'))}
          data-surface={store ? undefined : 'ink'}>
          <Mark kind={toast.kind} store={store} />
          <span className="min-w-0 flex-1">
            {toast.text}
            {toast.sub ? <span className="block text-xs opacity-80">{toast.sub}</span> : null}
            {toast.undo ? <span className="hidden motion-reduce:inline"> Undo for {UNDO_MS / 1000} seconds.</span> : null}
          </span>
          {toast.undo ? (
            // aria-disabled, not disabled: a disabled button drops keyboard focus to the page.
            <button type="button" onClick={undo} aria-disabled={busy} className="inline-flex min-h-10 items-center rounded-sm px-2 font-semibold underline underline-offset-2 md:min-h-9">
              {busy ? 'Undoing…' : 'Undo'}
            </button>
          ) : null}
          {toast.action ? (
            <button type="button" onClick={act} aria-disabled={busy} className="inline-flex min-h-10 items-center rounded-sm px-2 font-semibold underline underline-offset-2 md:min-h-9">
              {toast.action.label}
            </button>
          ) : null}
          {toast.kind === 'error' ? (
            <button type="button" onClick={() => leave(toast.id)} aria-label="Close" className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm opacity-80 hover:opacity-100 md:size-9">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          ) : null}
          {toast.undo && !busy ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 animate-undo-window bg-current opacity-60 motion-reduce:hidden"
            style={{ animationDuration: `${UNDO_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} /> : null}
        </div>
      ) : null
  return (
    <Ctx.Provider value={api}>
      {children}
      {el && host?.isConnected && host.open ? createPortal(el, host) : el}
      {region ? <div id={TOAST_REGION_ID} aria-live="polite" aria-atomic="true" className="sr-only" /> : null}
    </Ctx.Provider>
  )
}
/** The polite region a Toaster renders on a page without the shell's (announce() falls back to it). */
export const TOAST_REGION_ID = 'toast-announcer'

/** The kind's mark: a check or an exclamation in a disc, popping once (base.css [data-mark]). Never the only sign: the words say it. */
function Mark({ kind, store }: { kind: 'ok' | 'error'; store: boolean }) {
  const disc = kind === 'ok' ? (store ? 'bg-store-good' : 'bg-ok-mark') : (store ? 'bg-store-bad' : 'bg-danger-mark')
  return (
    <span data-mark aria-hidden className={cn('grid size-5.5 shrink-0 place-items-center rounded-full', disc, store ? 'text-store-paper' : 'text-primary-foreground')}>
      {kind === 'ok'
        ? <svg width="13" height="13" viewBox="0 0 16 16"><path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg width="13" height="13" viewBox="0 0 16 16"><path d="M8 3.6v5.4M8 12v.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>}
    </span>
  )
}
