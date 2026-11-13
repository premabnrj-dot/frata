'use client'

import { useEffect } from 'react'
import { inField } from '@/domains/ui/shortcuts'
import { useShortcutsEnabled } from '@/components/ui/use-shortcuts'
import { Icon } from '@/components/icons/icon'

// =============================================================================
// FILE: src/components/shell/rail-toggle.tsx — THE SIDEBAR AS A 64 PX RAIL, BY CHOICE (Neel N1, § Layout · Sidebar).
//
// From 768 to 1279 px the sidebar is a rail by CSS; this makes it one at any width (or a full sidebar again). The choice
// is a cookie, `rail=1` (read by the layouts as '1' or '0' only, so the first paint is right), set here in the browser:
// no server round trip, no re-render of the shell. "[" toggles it too, never while typing, with a modifier, in a
// dialog, or when this person turned single-key shortcuts off on this device.
// =============================================================================

const ASIDE = '[data-shell-aside]'

function toggle() {
  const aside = document.querySelector<HTMLElement>(ASIDE)
  if (!aside) return
  const on = !aside.hasAttribute('data-rail')
  aside.toggleAttribute('data-rail', on)
  document.cookie = `rail=${on ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
  document.querySelector<HTMLButtonElement>('[data-rail-toggle]')?.setAttribute('aria-pressed', String(on))
}

export function RailToggle({ on, ink = false }: { on: boolean; ink?: boolean }) {
  const [enabled] = useShortcutsEnabled()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey || !enabled || document.querySelector('dialog[open]')) return
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t && inField({ tag: t.tagName, editable: t.isContentEditable, type: t.getAttribute('type') })) return
      e.preventDefault(); toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
  return (
    <button type="button" data-rail-toggle="" aria-pressed={on} aria-keyshortcuts="[" onClick={toggle}
      className={`hidden h-8.5 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium md:flex ${ink ? 'text-ink-foreground/80 hover:bg-ink-foreground/10 hover:text-ink-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
      <Icon name="sidebar" className="size-[18px] shrink-0" /><span data-nav-label="">Collapse sidebar</span>
    </button>
  )
}
