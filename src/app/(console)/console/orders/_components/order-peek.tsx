'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { QuickLook } from '@/components/data/quick-look'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { button } from '@/components/ui/button'
import type { Peek } from './peek-types'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/order-peek.tsx — QUICK LOOK AT AN ORDER (Neel N1c·4).
// What it holds, where it goes, how it is paid and its last three steps, from ../[number]/peek (words only, no
// cost). "Open order" goes to the page. Looking only: nothing here changes the order.
// =============================================================================

export function OrderPeek({ n, label, onClose, onMove }: { n: number; label: string; onClose: () => void; onMove: (by: 1 | -1) => void }) {
  const [peek, setPeek] = useState<Peek | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    setPeek(null); setError(null)
    fetch(`/console/orders/${n}/peek`, { signal: ctl.signal })
      .then(async (r) => { const b = await r.json(); if (r.ok) setPeek(b as Peek); else setError((b as { error?: string }).error ?? 'We could not open this order.') })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError('We could not open this order. Check your connection.') })
    return () => ctl.abort()
  }, [n])
  const dt = 'text-label text-muted-foreground'
  return (
    <QuickLook title={label} onClose={onClose} onMove={onMove}
      footer={<><span />
        <Link href={`/console/orders/${n}`} className={button({ variant: 'primary', size: 'sm' })}>Open order</Link></>}>
      {error ? <Panel title={error} />
        : !peek ? <p role="status" className="text-sm text-muted-foreground">Loading…</p>
          : (
            <div className="flex flex-col gap-5 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={peek.state.tone}>{peek.state.label}</Badge><span className="text-muted-foreground">{peek.payment} · {peek.placed}</span></div>
              <section aria-label="Items">
                <ul className="flex flex-col gap-2">
                  {peek.lines.map((l, i) => (
                    <li key={i} className="flex items-baseline gap-3"><span className="flex-1"><span className="block">{l.title}</span>{l.options ? <span className="block text-small text-muted-foreground">{l.options}</span> : null}</span>
                      <span className="font-num tabular-nums text-muted-foreground">{l.qty} × {l.price}</span></li>
                  ))}
                </ul>
                <p className="mt-2 flex justify-between border-t border-line-soft pt-2 font-medium"><span>Total</span><span className="font-num tabular-nums">{peek.total}</span></p>
              </section>
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2">
                <dt className={dt}>Customer</dt><dd>{peek.customer}</dd>
                {peek.phone ? <><dt className={dt}>Phone</dt><dd className="font-num">{peek.phone}</dd></> : null}
                {peek.address ? <><dt className={dt}>Address</dt><dd>{peek.address}</dd></> : null}
              </dl>
              {peek.events.length ? (
                <section aria-label="Latest">
                  <ol className="flex flex-col gap-1.5">{peek.events.map((e, i) => <li key={i} className="flex justify-between gap-3"><span>{e.text}</span><span className="shrink-0 text-small text-muted-foreground">{e.at}</span></li>)}</ol>
                </section>
              ) : null}
            </div>
          )}
    </QuickLook>
  )
}
