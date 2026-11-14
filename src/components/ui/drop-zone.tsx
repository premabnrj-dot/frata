'use client'

import { useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ProgressBar } from './long-job'

// =============================================================================
// FILE: src/components/ui/drop-zone.tsx — DROP OR CHOOSE FILES (Neel N0b, § More components · Upload).
//
// Four states, as drawn: ready (dashed, "Drop … or choose", what it takes), over ("Drop to add 3 photos", the select
// tint), uploading (the name, a bar, "62% · 4.1 of 6.6 MB"), failed (the name and the fix in the bad tint). Done shows
// the file in place (the caller's list). The label is a real file input, so the keyboard and a phone's picker work.
// =============================================================================

export type Upload = { name: string; loaded?: number; size?: number; error?: string }

const mb = (b: number) => (b / 1048576).toLocaleString('en-IN', { maximumFractionDigits: 1 })

export function DropZone({ noun, accept, hint, multiple = true, onFiles, uploads = [], className }: {
  /** "photos", "a sheet" — the words in "Drop photos or choose". */
  noun: string; accept?: string; hint: string; multiple?: boolean; onFiles: (files: File[]) => void; uploads?: Upload[]; className?: string
}) {
  const id = useId()
  const [over, setOver] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className={cn('grid gap-2', className)}>
      <label htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(e.dataTransfer.items.length || 1) }} onDragLeave={() => setOver(0)}
        onDrop={(e) => { e.preventDefault(); setOver(0); onFiles([...e.dataTransfer.files]) }}
        className={cn('grid cursor-pointer gap-1.5 rounded-mid border-[1.5px] border-dashed p-3 text-sm transition-colors duration-fast ease-standard has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
          over ? 'border-primary bg-select text-select-foreground' : 'border-edge hover:bg-side')}>
        {over ? <span>Drop to add {over} {over === 1 ? noun.replace(/s$/, '') : noun}</span>
          : <><span>Drop {noun} or <span className="font-medium text-link">choose</span></span><span className="text-small text-muted-foreground">{hint}</span></>}
        <input ref={input} id={id} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
      </label>
      {uploads.map((u) => u.error
        // feedback-ok: a failed upload shows its fix at the file (Neel § Upload, its fourth state)
        ? <div key={u.name} className="grid gap-1.5 rounded-mid bg-danger p-3 text-sm"><b className="font-medium">{u.name}</b><span role="alert" className="text-label text-danger-text">{u.error}</span></div>
        : <div key={u.name} className="grid gap-1.5 rounded-mid border-[1.5px] border-dashed border-edge p-3 text-sm"><b className="font-medium">{u.name}</b>
            <ProgressBar value={u.size ? Math.round(((u.loaded ?? 0) / u.size) * 100) : 0} label={`Uploading ${u.name}`} />
            {u.size ? <span className="font-num text-small text-muted-foreground">{Math.round(((u.loaded ?? 0) / u.size) * 100)}% · {mb(u.loaded ?? 0)} of {mb(u.size)} MB</span> : null}</div>)}
    </div>
  )
}
