// =============================================================================
// FILE: src/domains/ui/splitter.ts — A RESIZE EDGE'S ARITHMETIC (WAI-ARIA window splitter).
//
// Pure: the value a key press or a drag gives an edge. The value is the size of the panel the edge belongs to; `grows`
// is the arrow that widens it (→ for a panel on the left, ← for one on the right). The primitive is
// src/components/ui/resize-edge.tsx; the Studio workbench's limits are src/domains/studio/layout.ts.
// =============================================================================

export type Splitter = { value: number; min: number; max: number; grows: 'ArrowRight' | 'ArrowLeft' }

/** One arrow press; with Shift, four of them. */
export const SPLITTER_STEP = 16

export const clampTo = (min: number, max: number, v: number, fallback = min): number =>
  Math.round(Math.min(max, Math.max(min, Number.isFinite(v) ? v : fallback)))

/** The edge's value after a key, or null when the key is not the edge's (← → Home End). */
export function splitterKey(s: Splitter, key: string, shift = false): number | null {
  const by = shift ? SPLITTER_STEP * 4 : SPLITTER_STEP
  const shrinks = s.grows === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight'
  if (key === s.grows) return clampTo(s.min, s.max, s.value + by)
  if (key === shrinks) return clampTo(s.min, s.max, s.value - by)
  if (key === 'Home') return s.min
  if (key === 'End') return s.max
  return null
}

/** The edge's value during a drag: where it started and how far the pointer has moved (px, + is right). */
export function splitterDrag(s: Splitter, dx: number): number {
  return clampTo(s.min, s.max, s.grows === 'ArrowRight' ? s.value + dx : s.value - dx)
}
