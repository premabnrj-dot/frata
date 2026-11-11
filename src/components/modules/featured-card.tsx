'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const KEY = 'frrata.featured.dismissed'

/**
 * The featured card on Apps (A2): the server renders the words, the rupees and the one link; this only hides it.
 * Hidden until storage is read (no flash for a shop that said Not now). Not now hides it until the next invoice: the
 * stored id is that invoice's. A browser convenience only; the server never reads it.
 */
export function FeaturedCard({ id, action, children }: { id: string; action: React.ReactNode; children: React.ReactNode }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    let dismissed: string | null = null
    try { dismissed = localStorage.getItem(KEY) } catch { /* private mode */ }
    setShown(dismissed !== id)
  }, [id])
  if (!shown) return null
  return (
    <section aria-label="For your shop" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">{children}</div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {action}
        <Button variant="ghost" onClick={() => { try { localStorage.setItem(KEY, id) } catch { /* private mode */ } setShown(false) }}>Not now</Button>
      </div>
    </section>
  )
}
