'use client'

import { useEffect, useId, useRef } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/dialog.tsx
//
// A DIALOG ONLY FOR WHAT LOSES WORK, MONEY OR STOCK (design-language § Work
// queues 4); routine actions get Undo instead. The caller writes the sentences
// and names both buttons by their outcome ("Cancel order" / "Keep the order").
// Native <dialog> with showModal(): the page behind is inert, focus is held
// inside and returns to the button that opened it, Esc and a click on the
// backdrop close it (as "keep"). Motion: dialog[data-dialog] in globals.css.
// =============================================================================

export function Dialog({ open, onClose, title, description, children, actions, className }: {
  open: boolean
  /** Esc, the backdrop and the safe button all call this. */
  onClose: () => void
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  /** The buttons, the safe one first; give it autoFocus, so Enter never confirms what loses something. */
  actions: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId(), descId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} data-dialog aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className={cn('m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-0 text-popover-foreground', className)}>
      <div className="grid gap-4 p-5">
        <h2 id={titleId} className="text-section font-semibold">{title}</h2>
        {description ? <div id={descId} className="text-sm text-muted-foreground">{description}</div> : null}
        {children}
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </dialog>
  )
}
