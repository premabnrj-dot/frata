'use client'

// =============================================================================
// FILE: src/components/ui/anchor.ts
//
// Puts a [popover] under the button that opened it, inside the viewport (a
// popover sits in the top layer, so no card or table can clip it). Flips above
// when there is no room below. CSS anchor positioning would do this without
// script, but is not in every browser our merchants use yet (2026-11-07).
// =============================================================================

const GAP = 6, EDGE = 8

export function placeUnder(anchor: HTMLElement, pop: HTMLElement, align: 'start' | 'end' = 'start') {
  const a = anchor.getBoundingClientRect()
  pop.style.position = 'fixed'; pop.style.margin = '0'; pop.style.inset = 'auto'
  const p = pop.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  let left = align === 'end' ? a.right - p.width : a.left
  left = Math.max(EDGE, Math.min(left, vw - p.width - EDGE))
  const below = a.bottom + GAP
  const top = below + p.height > vh - EDGE && a.top - GAP - p.height > EDGE ? a.top - GAP - p.height : below
  pop.style.left = `${Math.round(left)}px`; pop.style.top = `${Math.round(top)}px`
}
