'use client'

import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/icons/icon'
import { BOOK, SERIF, type ShellFlags } from './fixtures'

// The Brand book in the Design tab (mockup docs/mockups/2026-11-22-four-screens.html § 3; owner-approved 2026-11-22,
// call 7): the brand record read-only, opened in place from the Brand row. Design goes back, as does Esc; the caller
// returns focus to the row. A change waiting for the owner shows its chip; the book shows the live brand. A Builder
// reads it with no way to Brand. Fixture only: Change in Brand goes nowhere in the shell (V3b's data).

function Swatches({ colours }: { colours: readonly string[] }) {
  return <span className="flex gap-1.5">{colours.map((c) => <i key={c} aria-hidden="true" style={{ background: c }} className="size-5.5 rounded-sm border border-border" />)}</span>
}

export function BrandBook({ flags, onBack }: { flags: ShellFlags; onBack: () => void }) {
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => { back.current?.focus() }, [])
  const rows: [string, React.ReactNode][] = [
    ['In one line', BOOK.line], ['Voice', BOOK.voice], ['Who buys', BOOK.buyers], ['Words we use', BOOK.words], ['Never', BOOK.never],
    ['Logo', flags.noLogo ? 'None yet' : BOOK.logo],
    [`Look · ${BOOK.look}`, <Swatches key="s" colours={BOOK.lookSwatches} />],
    ['Type', <span key="t" style={{ fontFamily: SERIF }} className="text-title font-semibold">{BOOK.type}</span>],
  ]
  return (
    <section aria-labelledby="brand-book-h" className="grid content-start gap-3.5"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onBack() } }}>
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <Button ref={back} size="sm" variant="ghost" onClick={onBack} className="-ml-2"><Icon name="back" className="size-4" />Design</Button>
        <h3 id="brand-book-h" className="text-label font-semibold">Brand book</h3>
        {flags.waiting ? <Badge tone="warn">Waiting for the owner</Badge> : null}
      </div>
      <dl className="grid gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1"><dt className="text-small font-medium text-muted-foreground">{k}</dt><dd className="text-label">{v}</dd></div>
        ))}
      </dl>
      {flags.builder ? null : <div><Button size="sm" variant="secondary">{flags.noLogo ? 'Add a logo in Brand' : 'Change in Brand'}</Button></div>}
    </section>
  )
}
