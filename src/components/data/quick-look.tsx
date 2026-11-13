'use client'

import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

// =============================================================================
// FILE: src/components/data/quick-look.tsx — A RECORD BESIDE ITS LIST (Neel § Patterns · Quick look, N1c·4).
//
// 400 px from the right over the list, which stays visible and keeps its scroll (not modal: no backdrop, the list
// still takes a click). It takes focus when it opens; ↑ ↓ ask the list for the next or previous record; Esc closes and
// hands focus back (the list's own row). Never for editing. Desktop only: a phone opens the record's page.
// =============================================================================

export function QuickLook({ title, onClose, onMove, children, footer }: {
  title: string; onClose: () => void; onMove: (by: 1 | -1) => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => { panel.current?.focus() }, [])
  return (
    <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="false" aria-label={`Quick look: ${title}`} data-quick-look=""
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose() }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const t = e.target as HTMLElement
          if (t.closest('input, textarea, select')) return
          e.preventDefault(); onMove(e.key === 'ArrowDown' ? 1 : -1)
        }
      }}
      className="fixed inset-y-0 right-0 z-40 hidden w-100 flex-col border-l border-border bg-card shadow-lg outline-none md:flex motion-safe:animate-panel">
      <header className="flex items-center gap-2 border-b border-line-soft px-5 py-3.5">
        <h2 className="flex-1 truncate font-num text-section font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close quick look" className="inline-grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X aria-hidden="true" className="size-4" /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <footer className="flex items-center justify-between gap-2 border-t border-line-soft px-5 py-3">{footer}</footer> : null}
    </aside>
  )
}
