'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// =============================================================================
// FILE: src/components/shell/nav-progress.tsx — the top progress bar.
//
// Console and Admin have no loading.tsx (frata-design-language § Console
// patterns): a 2 px ink bar shows that a move is on its way. It appears only
// if the move takes longer than 150 ms, so quick ones show nothing. It starts
// on a click on an internal link (the leave guard stops the click and moves
// later, through startNavigation()), and stops when
// the path or search changes, or after 10 s. Reduced motion: no animation.
// =============================================================================

const START = 'frata:navigation-start'

/** For code that moves with router.push (the leave guard): show the bar as a link click would. */
export function startNavigation() { window.dispatchEvent(new Event(START)) }

export function NavProgress() {
  const path = usePathname(), search = useSearchParams()
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle')
  const timers = useRef<number[]>([])
  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = [] }
  useEffect(() => {
    const start = () => { clear(); timers.current.push(window.setTimeout(() => setState('run'), 150), window.setTimeout(() => setState('idle'), 10_000)) }
    const onClick = (e: MouseEvent) => {
      // Not e.defaultPrevented: Next's <Link> prevents every local click itself. A click the leave guard holds back
      // never gets here (its capture listener stops it); its own move calls startNavigation() (impact review U·2a).
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement).closest('a')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return
      start()
    }
    document.addEventListener('click', onClick)
    window.addEventListener(START, start)
    return () => { document.removeEventListener('click', onClick); window.removeEventListener(START, start); clear() }
  }, [])
  useEffect(() => {
    clear()
    setState((s) => (s === 'run' ? 'done' : 'idle'))
    timers.current.push(window.setTimeout(() => setState('idle'), 400))
  }, [path, search])
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 print:hidden">
      <div className={`h-full bg-primary motion-reduce:transition-none ${state === 'run' ? 'w-4/5 animate-nav-run' : state === 'done' ? 'w-full opacity-0 transition-[width,opacity] duration-base ease-standard' : 'w-0 opacity-0'}`} />
    </div>
  )
}
