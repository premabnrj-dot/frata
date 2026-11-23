'use client'

import { useEffect, useId, useRef } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/dialog.tsx
//
// A DIALOG CONFIRMS WHAT LOSES WORK, MONEY OR STOCK, OR IS A SETUP POPUP
// (design-language § Feedback 4). Never one inside another. Routine actions get
// Undo instead. The caller writes the sentences and names both buttons by their
// outcome ("Cancel order" / "Keep the order").
// Native <dialog> with showModal(): the page behind is inert, focus is held
// inside and returns to the button that opened it, Esc and a click on the
// backdrop close it (as "keep"). Motion: dialog[data-dialog] in globals.css.
// On a phone it is a sheet from the bottom, and the phone's Back closes it (as
// "keep", spec U · U3) natively: Android's Back is a close request, the same
// `cancel` as Esc. No history entry of our own: Next replaces the entry on a
// server action or refresh, and a back() racing a router.push undoes the push.
// A close request the browser lets through without `cancel` (no user
// activation since the last one) still reaches onClose through `close`.
// =============================================================================

export function Dialog({ open, onClose, onDismiss, picto, title, description, children, actions, error, className }: {
  open: boolean
  /** Esc, Android's Back, the backdrop and the safe button all call this. It must set `open` to false: the browser may already have closed the dialog. */
  onClose: () => void
  /**
   * Draws the ✕ (`aria-label="Close"`) at the header's end, which calls this (O1·8; a setup popup or a choice, never a
   * confirm of what loses something). It must set `open` to false, as onClose; it may be the same function.
   */
  onDismiss?: () => void
  /**
   * A setup popup's pictogram before the title (mockup § 2 `.dh .picto.sm`, O2a·4): pass
   * `<PictoTile name=… tone="haldi" size="sm" />`. A node, not a name, so a page with a Dialog never loads the
   * pictograms' drawings (they come with the popup's own chunk).
   */
  picto?: React.ReactNode
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  /**
   * The buttons. Mark the SAFE one `data-autofocus`: it gets focus on open, so Enter never confirms what loses
   * something. (React's autoFocus does nothing here: the dialog's content mounts while it is closed.)
   */
  actions: React.ReactNode
  /** What went wrong when its action failed: shown here, above the buttons, never a second popup (§ Feedback 4). */
  error?: string | null
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId(), descId = useId()
  const wanted = useRef(open); wanted.current = open
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLElement>('[data-autofocus]')?.focus() }
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} data-dialog aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClose={() => { if (wanted.current) onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className={cn('m-auto w-[min(32rem,calc(100vw-2rem))] text-left rounded-lg border border-border bg-popover p-0 text-popover-foreground', className)}>
      <div data-dialog-body="" className="grid gap-4 p-5">
        <div className="flex items-center gap-3">{picto}<h2 id={titleId} className="flex-1 text-section font-semibold">{title}</h2>{onDismiss && <button type="button" aria-label="Close" onClick={onDismiss} className="size-8 rounded-md hover:bg-accent">✕</button>}</div>
        {description ? <div id={descId} className="text-sm text-muted-foreground">{description}</div> : null}
        {children}
        <DialogError error={error} />
        {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
      </div>
    </dialog>
  )
}

/** A dialog's refusal, above its buttons (§ Feedback 4). A dialog whose buttons sit inside its own form (Frrata Admin's
 *  form dialogs) draws this itself, just before them; any other passes `error` to Dialog. */
export function DialogError({ error }: { error?: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="flex animate-err-in items-start gap-2 rounded-md bg-danger px-3 py-2.5 text-sm text-danger-text">
      <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" className="mt-px shrink-0">
        <circle cx="8" cy="8" r="7.5" fill="currentColor" /><path d="M8 4.4v4.6M8 11.6v.2" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>{error}</span>
    </p>
  )
}
