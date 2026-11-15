'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/chip-input.tsx — A LIST TYPED AS CHIPS (Neel N2b·3, Settings board: "PIN codes without Pay
// on delivery"). Each value a chip with its × (a real button, named); typing a space, a comma or Enter, or pasting a
// list, adds what was typed; Backspace in an empty box takes the last chip back into it. The value stays a list (the
// form keeps it joined by ", ", as the field always did). A chip `bad` says so in its colour and its name; the field's
// error line says which.
// =============================================================================

export function ChipInput({ id, values, onChange, label, add = '+ Add', bad, describedBy, invalid, mono = false }: {
  id: string
  values: string[]
  onChange: (next: string[]) => void
  /** What one item is, for "Remove 800001" and the box's name ("Add a PIN code"). */
  label: string
  add?: string
  bad?: (v: string) => boolean
  describedBy?: string
  invalid?: boolean
  mono?: boolean
}) {
  const [draft, setDraft] = useState('')
  const take = (text: string) => {
    const parts = text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)
    if (!parts.length) return
    const next = [...values]
    for (const p of parts) if (!next.includes(p)) next.push(p)
    onChange(next)
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => {
        const wrong = bad?.(v) ?? false
        return (
          <span key={v} className={cn('inline-flex min-h-8 items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2 text-sm tabular-nums', mono && 'font-mono',
            wrong ? 'border-danger-text bg-danger text-danger-text' : 'border-input')}>
            {v}
            <button type="button" aria-label={`Remove ${v}${wrong ? ' (not valid)' : ''}`} onClick={() => onChange(values.filter((x) => x !== v))}
              className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-sunk hover:text-foreground md:size-6">×</button>
          </span>
        )
      })}
      <input id={id} value={draft} aria-label={`Add ${label}`} aria-describedby={describedBy} aria-invalid={invalid || undefined} placeholder={add}
        onChange={(e) => { const v = e.target.value; if (/[\s,;]$/.test(v)) take(v); else setDraft(v) }}
        onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\s,;]/.test(t.trim())) { e.preventDefault(); take(draft + t) } }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); take(draft) }
          else if (e.key === 'Backspace' && !draft && values.length) { e.preventDefault(); setDraft(values.at(-1) ?? ''); onChange(values.slice(0, -1)) }
        }}
        onBlur={() => take(draft)}
        className={cn('h-11 w-28 rounded-md border border-dashed border-input bg-card px-2 text-sm placeholder:text-muted-foreground md:h-8', mono && 'font-mono', invalid && 'border-danger-text')} />
    </div>
  )
}
