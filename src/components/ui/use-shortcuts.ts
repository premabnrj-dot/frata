'use client'

import { useEffect, useRef, useState } from 'react'
import { shortcutFor, type ShortcutAction } from '@/domains/ui/shortcuts'

// =============================================================================
// FILE: src/components/ui/use-shortcuts.ts
//
// The queue's keys, wired: every key press goes through shortcutFor()
// (src/domains/ui/shortcuts.ts, tested) and only a returned action is acted
// on — so typing in a field, a modifier, an open dialog or menu, or the
// person's "off" switch all leave the key to the browser.
// The switch is kept on this device (localStorage), read safely.
// =============================================================================

const OFF_KEY = 'frata.shortcuts.off'

export function useShortcutsEnabled(): [boolean, (on: boolean) => void] {
  const [enabled, setEnabled] = useState(true)
  useEffect(() => { try { setEnabled(localStorage.getItem(OFF_KEY) !== '1') } catch { /* private window: on */ } }, [])
  const set = (on: boolean) => { setEnabled(on); try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1') } catch { /* this visit only */ } }
  return [enabled, set]
}

export function useShortcuts(enabled: boolean, handlers: Partial<Record<ShortcutAction, () => void>>) {
  // The latest handlers without re-binding the listener on every render.
  const live = useRef(handlers)
  live.current = handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : document.body
      const action = shortcutFor({
        key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        target: { tag: t.tagName, editable: t.isContentEditable, type: t instanceof HTMLInputElement ? t.type : null },
        modalOpen: !!document.querySelector('dialog[open], [popover]:popover-open'),
        enabled,
      })
      const run = action ? live.current[action] : undefined
      if (!run) return
      e.preventDefault()
      run()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}
