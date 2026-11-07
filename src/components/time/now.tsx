'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

// =============================================================================
// FILE: src/components/time/now.tsx — "now", the same on the server and in the
// browser (check:clock).
//
// A client component is rendered twice: on the server, then again in the
// browser at hydration. Read the clock in both and any text derived from it
// ("just now" / "1 min ago", "goes live in 3 h", "ships by 14 Nov") can differ
// when a minute or a day turns in between, and React throws #418 (found on
// Online payments, 2026-11-07). So a page passes ITS render time down once,
// and every component derives from that. Event handlers and timers may read
// the real clock; render never does.
// =============================================================================

const NowContext = createContext<string | null>(null)

/** Wrap a page's client tree; `at` is the server's render time (new Date().toISOString() in the page). */
export function NowProvider({ at, children }: { at: string; children: ReactNode }) {
  return <NowContext.Provider value={at}>{children}</NowContext.Provider>
}

/** The page's render time. Throws without a provider, so a component can never fall back to the browser's clock. */
export function useNow(): Date {
  const at = useContext(NowContext)
  if (!at) throw new Error('useNow() needs a <NowProvider at={…}> from the page')
  return useMemo(() => new Date(at), [at])
}
