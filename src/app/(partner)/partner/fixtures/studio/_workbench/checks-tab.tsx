'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BUILDING, CHECKS, TO_FIX } from './fixtures'

// Checks (mockup screen 1, `data-panel="checks"`), loaded with next/dynamic on first open: the publish checks on this
// version, each with where it was found; one that fails offers Fix with the agent. Fixture only (WB·5 keeps results).

export default function ChecksTab() {
  return (
    <div className="grid content-start gap-3.5">
      <div className="flex min-h-8 items-center justify-between gap-2.5">
        <span className="text-label text-muted-foreground">Checks on {BUILDING}</span>
        {TO_FIX ? <Badge tone="warn">{TO_FIX} to fix</Badge> : <Badge tone="ok">All pass</Badge>}
      </div>
      <ul className="grid">
        {CHECKS.map((c) => (
          <li key={c.title} className="grid gap-0.5 border-b border-line-soft py-2 last:border-0">
            <span>{c.title}</span>
            <small className={c.fix ? 'font-mono text-small text-muted-foreground' : 'font-num text-small text-muted-foreground'}>{c.where}</small>
            {c.fix ? <div><Button size="sm" variant="secondary">Fix with the agent</Button></div> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
