'use client'

import { useRef } from 'react'
import { splitterDrag, splitterKey, type Splitter } from '@/domains/ui/splitter'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/resize-edge.tsx — A PANEL'S RESIZE EDGE (Studio workbench, plan WB·2; spec
// docs/specs/2026-11-22-studio-workbench.md § 1 "the resize edge is a separator with a value, moved by arrow keys").
//
// A WAI-ARIA window splitter on a panel's inner edge: focusable, its value the panel's width in px, ← → move it by 16
// (Shift: 64), Home and End go to its limits; a drag moves it too. The arithmetic is src/domains/ui/splitter.ts. It
// sits over the panel's 1 px line: a 12 px target, the line drawn 2 px in the focus colour on hover, focus and drag.
// The parent is `relative`; an edge that widens with → sits on its right side, one that widens with ← on its left.
// =============================================================================

export function ResizeEdge({ label, value, min, max, grows, controls, onChange, onDone, className }: Splitter & {
  /** The separator's name ("Resize chat"). */
  label: string
  /** The id of the panel it resizes. */
  controls?: string
  onChange: (width: number) => void
  /** After a key or at the end of a drag: where the caller keeps the width. */
  onDone?: (width: number) => void
  className?: string
}) {
  const drag = useRef<{ x: number; start: number; last: number } | null>(null)
  const edge: Splitter = { value, min, max, grows }
  // Up, cancelled or capture lost: the edge stays where it was dragged to, and the caller keeps it.
  const end = () => { const d = drag.current; drag.current = null; if (d) onDone?.(d.last) }
  return (
    <div role="separator" aria-orientation="vertical" aria-label={label} aria-controls={controls}
      aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} aria-valuetext={`${value} pixels`} tabIndex={0} data-edge
      onKeyDown={(e) => {
        const next = splitterKey(edge, e.key, e.shiftKey)
        if (next === null) return
        e.preventDefault()
        onChange(next); onDone?.(next)
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.focus()
        drag.current = { x: e.clientX, start: value, last: value }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        d.last = splitterDrag({ ...edge, value: d.start }, e.clientX - d.x)
        onChange(d.last)
      }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      className={cn('group absolute inset-y-0 z-10 w-3 cursor-col-resize touch-none outline-none', grows === 'ArrowRight' ? '-right-1.5' : '-left-1.5', className)}>
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ring opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100" />
    </div>
  )
}
