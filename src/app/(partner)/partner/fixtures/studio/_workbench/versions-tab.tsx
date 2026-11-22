'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { VERSIONS } from './fixtures'

// Versions (mockup screen 1, `data-panel="versions"`), loaded with next/dynamic on first open: each version with its
// state or Restore, and Compare. Fixture only: Restore and Compare change nothing (V3b's data).

export default function VersionsTab() {
  const [compare, setCompare] = useState<'v7' | 'v8' | 'both'>('v7')
  return (
    <div className="grid content-start gap-3.5">
      <ul>
        {VERSIONS.map((v) => (
          <li key={v.name} className="flex items-center justify-between gap-2 border-b border-line-soft py-2">
            <span>{v.name}</span>
            {v.state === 'building' ? <Badge tone="neutral">Building</Badge>
              : v.state === 'preview' ? <Badge tone="ok">Preview</Badge>
                : <Button size="sm" variant="secondary">Restore {v.id}</Button>}
          </li>
        ))}
      </ul>
      <div className="flex min-h-8 items-center justify-between gap-2.5">
        <span className="text-label text-muted-foreground">Compare</span>
        <Segmented label="Compare" value={compare} onPick={setCompare} options={[['v7', 'v7'], ['v8', 'v8'], ['both', 'Side by side']] as const} />
      </div>
    </div>
  )
}
