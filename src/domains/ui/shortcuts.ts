// =============================================================================
// FILE: src/domains/ui/shortcuts.ts
//
// THE QUEUE'S KEYBOARD (design-language § Work queues 6; spec 1D·1): which key
// does what, and when a key must do nothing. Pure — the React hook
// (src/components/ui/use-shortcuts.ts, 1D·3) feeds it the event and acts on
// the answer, so the rules are tested without a browser.
//   j / k move · x select · Enter open · c confirm · h hold · p print slip
//   z undo · / search · ? the list. Never inside a field, never with a
//   modifier, never while a dialog is open, never when the person turned
//   single-key shortcuts off on this device (WCAG 2.1.4) — except ? and Esc, which stay.
// =============================================================================

export const SHORTCUTS = [
  { key: 'j', action: 'next', label: 'Next order' },
  { key: 'k', action: 'previous', label: 'Previous order' },
  { key: 'x', action: 'select', label: 'Select or unselect' },
  { key: 'Enter', action: 'open', label: 'Open the order' },
  { key: 'c', action: 'confirm', label: 'Confirm (a high-risk order opens instead)' },
  { key: 'h', action: 'hold', label: 'Put on hold' },
  { key: 'p', action: 'print', label: 'Print the packing slip' },
  { key: 'z', action: 'undo', label: 'Undo the last action' },
  { key: '/', action: 'search', label: 'Search' },
  { key: '?', action: 'help', label: 'Show these keys' },
] as const

export type ShortcutAction = (typeof SHORTCUTS)[number]['action'] | 'close'

export type KeyInput = {
  key: string
  ctrlKey: boolean; metaKey: boolean; altKey: boolean
  /** The focused element: what it is, and whether it takes text. */
  target: { tag: string; editable: boolean; type?: string | null }
  /** A dialog or menu is open: it owns the keyboard. */
  modalOpen: boolean
  /** Single-key shortcuts are on (the person can turn them off; kept on the device). */
  enabled: boolean
}

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'date', null, undefined, ''])

/** True when typing here would be typing, not a command. */
export function inField(t: KeyInput['target']): boolean {
  if (t.editable) return true
  const tag = t.tag.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return TEXT_INPUTS.has(t.type ?? null)
  return false
}

/** What a key press means on the queue, or null to let the browser have it. */
export function shortcutFor(e: KeyInput): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.key === 'Escape') return e.modalOpen ? null : 'close' // the dialog handles its own Esc
  if (e.modalOpen || inField(e.target)) return null
  // Enter on a button or link is that control's own click: the queue only opens a row that has focus.
  if (e.key === 'Enter' && e.target.tag.toUpperCase() !== 'TR') return null
  if (e.key === '?') return 'help' // always on, so the person can find the switch
  if (!e.enabled) return null
  return SHORTCUTS.find((s) => s.key === e.key)?.action ?? null
}

/**
 * `c` on a row: confirm, except where confirming needs a person to look first. A high-risk order opens instead
 * (the same guard bulk confirm applies); anything that cannot be confirmed opens too.
 */
export function confirmKey(row: { canConfirm: boolean; risk: 'low' | 'medium' | 'high' }): 'confirm' | 'open' {
  return row.canConfirm && row.risk !== 'high' ? 'confirm' : 'open'
}
