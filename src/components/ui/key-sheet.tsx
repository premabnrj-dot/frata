'use client'

import { SHORTCUTS, type ShortcutAction } from '@/domains/ui/shortcuts'
import { Button } from './button'
import { Dialog } from './dialog'

// =============================================================================
// FILE: src/components/ui/key-sheet.tsx
//
// The `?` sheet: every key the queue knows, and the switch that turns
// single-key shortcuts off (WCAG 2.1.4 — a speech-input user's words must not
// fire commands). `?` itself always opens it, so the switch can be found.
// =============================================================================

/** `only`: the keys this screen wires (a key it does not handle is not offered). `keys`: another screen's own table
 *  (the Studio workbench, src/domains/studio/layout.ts), shown instead of the queue's, with its own line and close. */
export function KeySheet({ open, onClose, enabled, onEnabled, only, keys, description, close = 'Close' }: {
  open: boolean; onClose: () => void; enabled: boolean; onEnabled: (on: boolean) => void; only?: ShortcutAction[]
  keys?: readonly { key: string; label: string }[]; description?: string | null; close?: string
}) {
  const rows = keys ?? SHORTCUTS.filter((s) => !only || only.includes(s.action))
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts"
      description={description === undefined ? 'Work through the queue without the mouse. Keys do nothing while you type in a box.' : description ?? undefined}
      actions={<Button data-autofocus variant="secondary" onClick={onClose}>{close}</Button>}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map((s) => (
          <div key={s.key} className="contents">
            <dt><kbd className="inline-grid min-w-7 place-items-center rounded-sm border border-input px-1.5 font-mono text-xs">{s.key === 'Enter' ? '↵' : s.key === ' ' ? 'Space' : s.key}</kbd></dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} className="size-6 accent-primary" />
        Use single-key shortcuts on this device
      </label>
    </Dialog>
  )
}
