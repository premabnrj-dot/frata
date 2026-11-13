'use client'

import { Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// =============================================================================
// FILE: src/components/data/live-search-field.tsx — A LIST'S SEARCH THAT ANSWERS AS YOU TYPE (Neel N1c, Products).
//
// For a list small enough to render per search (a shop's catalogue, thousands at most): 250 ms after the last key the
// page is replaced with ?q= (scroll kept, no history entry per key); Enter goes at once; Esc clears. The page stays
// the one source of rows. Orders, which can hold 150 k, uses its own rows route instead (orders/_components/orders-list.tsx).
// =============================================================================

const DEBOUNCE_MS = 250

export function LiveSearchField({ path, params, label, placeholder, value }: { path: string; params: Record<string, string>; label: string; placeholder: string; value: string }) {
  const router = useRouter()
  const [q, setQ] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { setQ(value) }, [value])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const go = (next: string, push = false) => {
    const u = new URLSearchParams(params)
    if (next.trim()) u.set('q', next.trim())
    const s = u.toString()
    const href = `${path}${s ? `?${s}` : ''}`
    if (push) router.push(href, { scroll: false }); else router.replace(href, { scroll: false })
  }
  const type = (next: string) => {
    setQ(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => go(next), DEBOUNCE_MS)
  }
  return (
    <form role="search" className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (timer.current) clearTimeout(timer.current); go(q, true) }}>
      <label htmlFor="search-q" className="sr-only">{label}</label>
      <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring md:h-9 md:max-w-md">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <input id="search-q" name="q" type="search" value={q} maxLength={60} autoComplete="off" placeholder={placeholder}
          onChange={(e) => type(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.preventDefault(); type('') } }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
        {q && <button type="button" aria-label="Clear search" onClick={() => type('')} className="inline-grid size-6 place-items-center rounded-sm text-muted-foreground hover:text-foreground"><X aria-hidden="true" className="size-4" /></button>}
      </div>
    </form>
  )
}
