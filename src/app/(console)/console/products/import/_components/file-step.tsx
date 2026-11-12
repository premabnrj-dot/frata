'use client'

import { useRef, useState } from 'react'
import { Icon } from '@/components/icons/icon'
import { Section } from '@/components/layout/section'
import { Button, button } from '@/components/ui/button'
import { MAX_PRODUCTS } from '@/domains/catalogue/import/limits'
import type { Running } from '@/lib/queries/imports'
import { cn } from '@/lib/utils'
import { Bar } from './parts'

const ACCEPT = '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Step 1 (mockup view 1 · File): drop or choose a spreadsheet, and the three ways to start. A paused import says where
 * it stopped: choosing the same file again continues it, or it can stop there.
 */
export function FileStep({ onFile, error, reading, running, onStop, stopping }: {
  onFile: (f: File) => void
  error?: string
  reading: { name: string; rows: number; csv: boolean } | null
  running: Running | null
  onStop: () => void
  stopping: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const pick = (files: FileList | null) => { const f = files?.[0]; if (f) onFile(f) }
  return (
    <>
      {running && (
        <Section title="Import paused" action={<span className="font-mono text-sm">{running.fileName}</span>}>
          <Bar done={running.next} total={running.chunks} label={`Part ${running.next} of ${running.chunks} imported`} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground"><span className="font-mono tabular-nums">{running.added.toLocaleString('en-IN')}</span> added · {running.next} of {running.chunks} parts</span>
            <span className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onStop} disabled={stopping}>Stop here</Button>
              {!running.costsOnly && <Button onClick={() => input.current?.click()} disabled={!!reading}>Choose the file again</Button>}
            </span>
          </div>
          {running.costsOnly && <p className="text-sm text-muted-foreground">Started with costs: an owner or admin can continue it.</p>}
        </Section>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!reading) pick(e.dataTransfer.files) }}
        aria-busy={!!reading || undefined}
        className={cn('grid justify-items-center gap-2.5 rounded-lg border-2 border-dashed border-input bg-card px-4 py-7 text-center transition-colors duration-fast', over && 'bg-accent')}>
        <Icon name="upload" className="size-8 text-muted-foreground" />
        {reading ? (
          <div className="grid w-full max-w-xs gap-2" role="status">
            <b className="text-base">Reading <span className="font-mono">{reading.name}</span></b>
            <Bar done={reading.csv ? Math.min(reading.rows, 1) : 1} total={reading.csv ? 1 : 3} label={`Reading ${reading.name}`} />
            {reading.rows > 0 && <span className="text-xs text-muted-foreground"><span className="font-mono tabular-nums">{reading.rows.toLocaleString('en-IN')}</span> rows read</span>}
          </div>
        ) : (
          <>
            <b className="text-base">Drop a spreadsheet</b>
            <span className="text-xs text-muted-foreground">Excel or CSV · up to {MAX_PRODUCTS} products</span>
            {!running && <Button onClick={() => input.current?.click()}>Choose a file</Button>}
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          </>
        )}
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Choose a spreadsheet"
          onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
      </div>
      {!running && (
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Section className="grid content-start gap-1.5 space-y-0 p-3 md:p-3">
            <b className="text-sm">Your own sheet</b>
            <span className="text-sm text-muted-foreground">Any columns · we match them</span>
            <a href="/templates/frrata-products.csv" download className={cn(button({ variant: 'secondary' }), 'justify-self-start')}>Download our template</a>
          </Section>
          <Section className="grid content-start gap-1.5 space-y-0 p-3 md:p-3">
            <b className="text-sm">From Shopify</b>
            <span className="text-sm text-muted-foreground">Products › Export › CSV</span>
          </Section>
          <Section className="grid content-start gap-1.5 space-y-0 p-3 md:p-3">
            <b className="text-sm">From WooCommerce</b>
            <span className="text-sm text-muted-foreground">Products › Export</span>
          </Section>
        </div>
      )}
    </>
  )
}
