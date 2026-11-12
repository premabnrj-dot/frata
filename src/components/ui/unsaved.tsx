'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './button'
import { Dialog } from './dialog'
import { startNavigation } from '@/components/shell/nav-progress'

// =============================================================================
// FILE: src/components/ui/unsaved.tsx
//
// ONE EXPLICIT SAVE (frata-design-language § Phase 1): the "Unsaved changes"
// bar that appears on the first edit, and the guard that asks before leaving.
// Used by every console form that edits what shoppers see.
// =============================================================================

/** Asks before leaving with changes: the browser's prompt for reload/close, our dialog for links inside the console. */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter()
  const [leaveTo, setLeaveTo] = useState<string | null>(null)
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) return
      e.preventDefault(); e.stopPropagation(); setLeaveTo(href)
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onClick, true)
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onClick, true) }
  }, [dirty])
  return {
    leaveTo,
    stay: () => setLeaveTo(null),
    leave: (forget: () => void) => { const to = leaveTo; forget(); setLeaveTo(null); if (to) { startNavigation(); router.push(to) } },
  }
}

/**
 * The page's changes and their Save. `top` (every page): sticky under the shell's header. `bottom` (the product editor,
 * products PR·2, mockup § The editor and § On a phone): at the foot, above the phone's bottom nav, where the thumb is;
 * `keys` shows the save shortcut the page wired (the button's name stays "Save"; the hint is for the eye).
 */
export function SaveBar({ onSave, onDiscard, pending, placement = 'top', keys }: { onSave: () => void; onDiscard: () => void; pending: boolean; placement?: 'top' | 'bottom'; keys?: string }) {
  return (
    <div role="region" aria-label="Unsaved changes" data-surface="ink" data-savebar={placement} className={placement === 'top'
      ? 'sticky top-[var(--shell-top,0px)] z-10 mb-3 flex animate-rise items-center gap-3 rounded-md bg-primary px-4 py-2.5 text-primary-foreground'
      : 'fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] z-30 flex animate-rise items-center gap-3 rounded-md bg-primary px-4 py-2.5 text-primary-foreground shadow-lg md:sticky md:inset-x-auto md:bottom-4 md:mt-4'}>
      <b className="text-sm">Unsaved changes</b>
      <span className="flex-1" />
      <button type="button" className="h-8 rounded-md border border-current px-3 text-sm" disabled={pending} onClick={onDiscard}>Discard</button>
      <button type="button" className="h-8 rounded-md bg-primary-foreground px-3 text-sm font-medium text-primary" disabled={pending} onClick={onSave}
        aria-keyshortcuts={keys ? 'Control+S Meta+S' : undefined}>
        {pending ? 'Saving…' : 'Save'}{keys && !pending && <span aria-hidden="true" className="ml-1.5 hidden font-mono text-xs opacity-70 md:inline">{keys}</span>}
      </button>
    </div>
  )
}

/** Leaving with changes: the one Dialog (a sheet on a phone), "Keep editing" the safe, focused button (§ Feedback 4). */
export function LeaveDialog({ open, what, onStay, onLeave }: { open: boolean; what: string; onStay: () => void; onLeave: () => void }) {
  // Kept mounted and opened/closed (never mounted open): closing returns focus to what had it.
  return (
    <Dialog open={open} onClose={onStay} title="Leave without saving?" description={<>Your changes to {what} are not saved and will be lost.</>}
      actions={<>
        <Button variant="secondary" data-autofocus onClick={onStay}>Keep editing</Button>
        <Button variant="destructive" onClick={onLeave}>Leave</Button>
      </>} />
  )
}
