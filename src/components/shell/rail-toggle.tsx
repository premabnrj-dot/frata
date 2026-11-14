'use client'

import { useEffect, useState } from 'react'
import { inField } from '@/domains/ui/shortcuts'
import { useShortcutsEnabled } from '@/components/ui/use-shortcuts'
import { Icon } from '@/components/icons/icon'
import type { RailChoice } from './rail'

// =============================================================================
// FILE: src/components/shell/rail-toggle.tsx — THE SIDEBAR AS A 64 PX RAIL, OR NOT, BY CHOICE (Neel N1, § Layout · Sidebar).
//
// From 768 to 1279 px the sidebar is a rail by CSS; this button (and "[") makes it the full sidebar there, or the rail
// at any width: it flips whatever is on screen now. The choice is the `rail` cookie ('1' rail, '0' full; railFrom), set
// in the browser with no server round trip, so the next page's first paint is right. "[" never fires while typing,
// with a modifier, held down, under a dialog or an open menu, or when this person turned single-key shortcuts off.
//
// THE RAIL'S TOOLTIPS: each label is placed beside its link with position: fixed (the aside keeps its own scroll, so
// nothing clips them), shown on hover and keyboard focus, kept while the pointer moves onto it, closed by Esc
// (WCAG 1.4.13). The label stays in the link's accessible name the whole time.
// =============================================================================

const ASIDE = '[data-shell-aside]'
const isRail = (a: HTMLElement) => a.getBoundingClientRect().width < 100

function setChoice(rail: boolean) {
  const aside = document.querySelector<HTMLElement>(ASIDE)
  if (!aside) return
  aside.setAttribute('data-rail', rail ? '1' : '0')
  document.cookie = `rail=${rail ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
}

export function RailToggle({ choice, ink = false }: { choice: RailChoice; ink?: boolean }) {
  const [enabled] = useShortcutsEnabled()
  const [rail, setRail] = useState(choice === 'rail')
  const flip = () => {
    const aside = document.querySelector<HTMLElement>(ASIDE)
    if (!aside) return
    const next = !isRail(aside)
    setChoice(next); setRail(next)
  }
  useEffect(() => {
    // What is on screen decides the label (a rail by CSS at 1024 says "Expand sidebar").
    const aside = document.querySelector<HTMLElement>(ASIDE)
    const sync = () => { if (aside) setRail(isRail(aside)) }
    sync()
    const ro = aside ? new ResizeObserver(sync) : null
    if (aside && ro) ro.observe(aside)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { aside?.setAttribute('data-tip-off', ''); return }
      if (e.key !== '[' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !enabled) return
      if (document.querySelector('dialog[open], [popover]:popover-open')) return
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t && inField({ tag: t.tagName, editable: t.isContentEditable, type: t.getAttribute('type') })) return
      e.preventDefault(); flip()
    }
    // Tooltips on the rail: placed beside the link they name, fixed, so the scrolling aside never clips them.
    const place = (e: Event) => {
      const link = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-nav], [data-rail-toggle]')
      if (!link || !aside || !isRail(aside)) return
      aside.removeAttribute('data-tip-off')
      const r = link.getBoundingClientRect()
      link.style.setProperty('--tip-x', `${aside.getBoundingClientRect().right + 6}px`)
      link.style.setProperty('--tip-y', `${r.top + r.height / 2}px`)
    }
    window.addEventListener('keydown', onKey)
    aside?.addEventListener('pointerover', place)
    aside?.addEventListener('focusin', place)
    return () => { window.removeEventListener('keydown', onKey); aside?.removeEventListener('pointerover', place); aside?.removeEventListener('focusin', place); ro?.disconnect() }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" data-rail-toggle="" aria-keyshortcuts="[" onClick={flip}
      className={`hidden h-8.5 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium md:flex ${ink ? 'text-ink-foreground/80 hover:bg-ink-foreground/10 hover:text-ink-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
      <Icon name="sidebar" className="size-4.5 shrink-0" /><span data-nav-label="">{rail ? 'Expand sidebar' : 'Collapse sidebar'}</span>
    </button>
  )
}
