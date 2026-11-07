'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// =============================================================================
// FILE: src/components/ui/toast.tsx
//
// FEEDBACK AFTER AN ACTION, WITH UNDO (design-language § Work queues 4): a
// routine, reversible action happens at once and says so here, with Undo for
// 8 seconds (an Undo link also stays on the record). One toast at a time: a new
// one replaces the last. The window pauses while the pointer or focus is on the
// toast, so there is time to reach Undo (WCAG 2.2.1). Under reduced motion the
// emptying bar becomes the words "Undo for 8 seconds" (§ UX foundation 25).
// Spoken through the shell's one polite live region: 1D·4b wires U·2a's
// announce() here once it is on main (agreed with the U session, 2026-11-07);
// until then the toast is seen, not spoken, and nothing uses it yet.
// =============================================================================

export const UNDO_MS = 8000

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
  const [paused, setPaused] = useState(false)
  const left = useRef(UNDO_MS), started = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setLeaving(true)
    setTimeout(() => { setToast(null); setLeaving(false) }, 200) // the exit takes as long as the entrance
  }, [])
  const run = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    started.current = Date.now(); left.current = ms
    timer.current = setTimeout(dismiss, ms)
  }, [dismiss])
  const pause = () => { setPaused(true); if (timer.current) { clearTimeout(timer.current); timer.current = null; left.current -= Date.now() - started.current } }
  // The bar and the timer pause and resume together, so what it shows is what is left.
  const resume = () => { setPaused(false); if (!timer.current && toast && !leaving) run(Math.max(1500, left.current)) }

  const show: Show = useCallback((t) => {
    setLeaving(false); setBusy(false); setPaused(false)
    setToast({ ...t, id: ++seq.current })
    run(UNDO_MS)
  }, [run])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const undo = async () => {
    if (!toast?.undo || busy) return
    setBusy(true); pause()
    const r = await toast.undo().catch(() => ({ ok: false, error: 'We could not undo that. Open the order to see where it is.' }))
    setBusy(false)
    if (r.ok) setToast({ id: ++seq.current, text: 'Undone.' })
    else setToast({ id: ++seq.current, text: r.error ?? 'We could not undo that.' })
    run(4000)
  }

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast ? (
        <div key={toast.id} data-toast data-leaving={leaving ? '' : undefined} onPointerEnter={pause} onPointerLeave={resume} onFocus={pause} onBlur={resume}
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 overflow-hidden rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground print:hidden md:bottom-6"
          data-surface="ink">
          <span className="min-w-0 flex-1">{toast.text}{toast.undo ? <span className="hidden motion-reduce:inline"> Undo for 8 seconds.</span> : null}</span>
          {toast.undo ? (
            <button type="button" onClick={undo} disabled={busy} className="inline-flex min-h-10 items-center rounded-sm px-2 font-semibold underline underline-offset-2 md:min-h-9">
              {busy ? 'Undoing…' : 'Undo'}
            </button>
          ) : null}
          {toast.undo && !busy ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 animate-undo-window bg-primary-foreground/60 motion-reduce:hidden" style={{ animationPlayState: paused ? 'paused' : 'running' }} /> : null}
        </div>
      ) : null}
    </Ctx.Provider>
  )
}
