'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

// =============================================================================
// FILE: src/components/ui/copy-field.tsx — A CODE OR LINK TO COPY (Neel N0b, § More components · Copy, share, steps).
//
// The text in mono on the sunk ground, Copy at its end. Copy says "✓ Copied" for 2 s (and announces it); where the
// browser refuses the clipboard, the text is selected for the person to copy themselves.
// =============================================================================

export function CopyField({ value, label, className }: { value: string; label: string; className?: string }) {
  const [done, setDone] = useState(false)
  const text = useRef<HTMLSpanElement>(null)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 2000) }
    catch {
      const r = document.createRange(); if (text.current) { r.selectNodeContents(text.current); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r) }
    }
  }
  return (
    <div className={cn('flex min-w-0 items-center gap-2 rounded-md border border-border bg-sunk py-1 pr-1 pl-2.5', className)}>
      <span ref={text} className="min-w-0 flex-1 truncate font-mono text-small">{value}</span>
      <Button size="sm" variant="secondary" onClick={copy} aria-label={done ? `${label} copied` : `Copy ${label}`} className={done ? 'text-ok-text' : undefined}>
        {done ? '✓ Copied' : 'Copy'}
      </Button>
      <span role="status" className="sr-only">{done ? 'Copied' : ''}</span>
    </div>
  )
}
