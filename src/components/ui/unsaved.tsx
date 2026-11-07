'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './button'
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

export function SaveBar({ onSave, onDiscard, pending }: { onSave: () => void; onDiscard: () => void; pending: boolean }) {
  return (
    <div role="region" aria-label="Unsaved changes" data-surface="ink" className="sticky top-[var(--shell-top,0px)] z-10 mb-3 flex animate-step-forward items-center gap-3 rounded-md bg-primary px-4 py-2.5 text-primary-foreground">
      <b className="text-sm">Unsaved changes</b>
      <span className="flex-1" />
      <button type="button" className="h-8 rounded-md border border-current px-3 text-sm" disabled={pending} onClick={onDiscard}>Discard</button>
      <button type="button" className="h-8 rounded-md bg-primary-foreground px-3 text-sm font-medium text-primary" disabled={pending} onClick={onSave}>
        {pending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

export function LeaveDialog({ what, onStay, onLeave }: { what: string; onStay: () => void; onLeave: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" onKeyDown={(e) => { if (e.key === 'Escape') onStay() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="leave-h" className="w-full max-w-sm animate-step-forward rounded-md border border-border bg-card p-5">
        <h2 id="leave-h" className="font-semibold">Leave without saving?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your changes to {what} are not saved and will be lost.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" autoFocus onClick={onStay}>Keep editing</Button>
          <Button variant="destructive" onClick={onLeave}>Leave</Button>
        </div>
      </div>
    </div>
  )
}

export function Message({ m, onReload }: { m: { tone: 'ok' | 'error'; text: string } | null; onReload?: () => void }) {
  if (!m) return null
  return (
    <p role={m.tone === 'ok' ? 'status' : 'alert'} className={`mt-3 rounded-md border px-3 py-2 text-sm ${m.tone === 'ok' ? 'border-ok-text/30 bg-ok text-ok-text' : 'border-danger-text/30 bg-danger text-danger-text'}`}>
      {m.text}{onReload && <> <button type="button" className="underline" onClick={onReload}>Reload</button></>}
    </p>
  )
}
