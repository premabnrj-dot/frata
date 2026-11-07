'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// =============================================================================
// FILE: src/components/ui/toast.tsx
//
// FEEDBACK AFTER AN ACTION, WITH UNDO (design-language § Work queues 4): a
// routine, reversible action happens at once and says so here, with Undo for
// 8 seconds (an Undo link also stays on the record). One toast at a time: a new
// one replaces the last. The window pauses while the pointer OR focus is on the
// toast, so there is time to reach Undo (WCAG 2.2.1). Under reduced motion the
// emptying bar becomes the words "Undo for 8 seconds" (§ UX foundation 25).
// Spoken through the shell's one polite live region: 1D·4b wires U·2a's
// announce() (src/components/shell/announce) here once it is on main (agreed
// with the U session, 2026-11-07); until then the toast is seen, not spoken,
// and nothing but the e2e fixture uses it.
// Every timer is held in a ref and cleared when a newer toast arrives, so a
// leaving or an earlier undo's result never overwrites the toast on screen
// (impact review 2026-11-07).
// =============================================================================

export const UNDO_MS = 8000
const EXIT_MS = 200 // the exit takes as long as the entrance (globals.css [data-toast])

type Toast = { id: number; text: string; undo?: () => Promise<{ ok: boolean; error?: string }> }
type Show = (t: Omit<Toast, 'id'>) => void

const Ctx = createContext<Show | null>(null)

/** `show({ text, undo })` from anywhere inside <Toaster>. */
export function useToast(): Show {
  const show = useContext(Ctx)
  if (!show) throw new Error('useToast outside <Toaster>')
  return show
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState({ hover: false, focus: false })
  const paused = held.hover || held.focus
  const seq = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const life = useRef<ReturnType<typeof setTimeout> | null>(null), exit = useRef<ReturnType<typeof setTimeout> | null>(null)
  const left = useRef(UNDO_MS), started = useRef(0)

  const clearAll = () => { if (life.current) clearTimeout(life.current); if (exit.current) clearTimeout(exit.current); life.current = exit.current = null }
  const dismiss = useCallback(() => {
    const id = seq.current
    setLeaving(true)
    exit.current = setTimeout(() => { if (seq.current === id) { setToast(null); setLeaving(false) } }, EXIT_MS)
  }, [])
  const run = useCallback((ms: number) => {
    clearAll()
    started.current = Date.now(); left.current = ms
    life.current = setTimeout(dismiss, ms)
  }, [dismiss])

  // Hover and focus each hold the window open; it runs again only when neither does.
  useEffect(() => {
    if (!toast || leaving) return
    if (paused) { if (life.current) { clearTimeout(life.current); life.current = null; left.current -= Date.now() - started.current } }
    else if (!life.current) run(Math.max(1500, left.current))
  }, [paused, toast, leaving, run])
  useEffect(() => clearAll, [])

  const show: Show = useCallback((t) => {
    seq.current++
    setLeaving(false); setBusy(false)
    setToast({ ...t, id: seq.current })
    run(UNDO_MS)
  }, [run])

  const undo = async () => {
    if (!toast?.undo || busy) return
    const id = seq.current
    setBusy(true); clearAll(); setLeaving(false)
    const r = await toast.undo().catch(() => ({ ok: false, error: 'We could not undo that. Open the order to see where it is.' }))
    // A newer toast arrived while this undo ran: its result is not news on top of it.
    if (seq.current !== id) return
    setBusy(false)
    // Same toast, new words: no remount, so keyboard focus stays on the toast, which now says what happened.
    setToast({ id, text: r.ok ? 'Undone.' : r.error ?? 'We could not undo that.' })
    box.current?.focus()
    run(4000)
  }

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast ? (
        <div key={toast.id} ref={box} tabIndex={-1} data-toast data-leaving={leaving ? '' : undefined}
          onPointerEnter={() => setHeld((h) => ({ ...h, hover: true }))} onPointerLeave={() => setHeld((h) => ({ ...h, hover: false }))}
          onFocus={() => setHeld((h) => ({ ...h, focus: true }))} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld((h) => ({ ...h, focus: false })) }}
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 overflow-hidden rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground print:hidden md:bottom-6"
          data-surface="ink">
          <span className="min-w-0 flex-1">{toast.text}{toast.undo ? <span className="hidden motion-reduce:inline"> Undo for {UNDO_MS / 1000} seconds.</span> : null}</span>
          {toast.undo ? (
            // aria-disabled, not disabled: a disabled button drops keyboard focus to the page.
            <button type="button" onClick={undo} aria-disabled={busy} className="inline-flex min-h-10 items-center rounded-sm px-2 font-semibold underline underline-offset-2 md:min-h-9">
              {busy ? 'Undoing…' : 'Undo'}
            </button>
          ) : null}
          {toast.undo && !busy ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 animate-undo-window bg-primary-foreground/60 motion-reduce:hidden"
            style={{ animationDuration: `${UNDO_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} /> : null}
        </div>
      ) : null}
    </Ctx.Provider>
  )
}
