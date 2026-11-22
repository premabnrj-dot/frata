'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { FIELD } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { PARTS, SITE, type Part } from './fixtures'

// Design (mockup screen 1, `data-panel="design"`): the picked part's words, photo, height, heading position, the
// brand's colours (read only), its block and a note for the agent. Fixture only: nothing saves (WB·4 makes each change
// a chat line and a version). Keyed by the part, so picking another starts from its own words.

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-h-8 items-center justify-between gap-2.5"><span className="text-label text-muted-foreground">{label}</span>{children}</div>
}

export function DesignTab({ picked }: { picked: Part }) {
  const part = PARTS[picked]
  const [heading, setHeading] = useState<string>(part.heading)
  const [height, setHeight] = useState<'short' | 'standard' | 'tall'>('standard')
  const [at, setAt] = useState<'top' | 'bottom'>('bottom')
  return (
    <div className="grid content-start gap-3.5">
      <p className="text-small font-medium text-muted-foreground">{part.name}</p>
      <label className="grid gap-1"><span className="text-small font-medium text-muted-foreground">Heading</span>
        <input className={cn(FIELD, 'w-full')} value={heading} onChange={(e) => setHeading(e.target.value)} /></label>
      <Row label="Photo"><Button size="sm" variant="secondary">Replace photo</Button></Row>
      <Row label="Height"><Segmented label="Height" value={height} onPick={setHeight} options={[['short', 'Short'], ['standard', 'Standard'], ['tall', 'Tall']] as const} /></Row>
      <Row label="Heading position"><Segmented label="Heading position" value={at} onPick={setAt} options={[['top', 'Top'], ['bottom', 'Bottom']] as const} /></Row>
      <Row label="Brand colours">
        <span className="flex gap-1.5">{SITE.swatches.map((c) => <i key={c} aria-hidden="true" style={{ background: c }} className="size-5.5 rounded-sm border border-border" />)}<span className="sr-only">{SITE.swatches.join(', ')}</span></span>
      </Row>
      <Row label="Block"><Button size="sm" variant="secondary">Swap block</Button></Row>
      <Row label="Note for the agent"><Button size="sm" variant="secondary">Add note</Button></Row>
    </div>
  )
}
